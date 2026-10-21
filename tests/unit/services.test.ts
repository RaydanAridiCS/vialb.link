import { describe, expect, it } from "vitest";
import { MemoryRateLimiter } from "@/server/adapters/rate-limiters";
import { Argon2PasswordHasher } from "@/server/adapters/argon2-password-hasher";
import { ChainGeoResolver, HeaderGeoResolver } from "@/server/adapters/geo";
import { SafeBrowsingChecker, TurnstileVerifier } from "@/server/adapters/external-checks";
import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";
import { mapError } from "@/server/http/error-mapper";
import { SettingsService } from "@/server/services/settings.service";
import { z } from "zod";
import { hashSync } from "bcryptjs";
import { buildFixture, users } from "../support/fixtures";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("AnalyticsService", () => {
  async function setup() {
    const f = buildFixture();
    const { link } = await f.links.create(users.alice, { destinationUrl: "https://a.example" }, { ip: null });
    return { f, link };
  }

  it("records clicks with hashed visitor, UA, geo, referrer, UTM and language (never the IP)", async () => {
    const { f, link } = await setup();
    await f.analytics.recordClick({
      linkId: link.id,
      ip: "198.51.100.23",
      headers: new Headers({
        "user-agent": BROWSER,
        referer: "https://www.reddit.com/r/x?secret=1",
        "accept-language": "de-DE,de;q=0.9",
      }),
      searchParams: new URLSearchParams("utm_source=reddit&utm_campaign=launch"),
    });
    const [click] = f.clickRepo.rows;
    expect(click).toMatchObject({
      linkId: link.id,
      country: "FR",
      city: "Paris",
      browser: "Chrome",
      os: "macOS",
      deviceType: "desktop",
      referrerHost: "reddit.com",
      referrerUrl: "https://www.reddit.com/r/x",
      utmSource: "reddit",
      utmCampaign: "launch",
      language: "de-DE",
      isBot: false,
    });
    expect(JSON.stringify(click)).not.toContain("198.51.100.23");
    expect(f.settingsRepo.salts.size).toBe(1);
  });

  it("never throws when recording fails", async () => {
    const f = buildFixture({ geo: { resolve: async () => Promise.reject(new Error("boom")) } });
    await expect(
      f.analytics.recordClick({
        linkId: "x",
        ip: null,
        headers: new Headers(),
        searchParams: new URLSearchParams(),
      }),
    ).resolves.toBeUndefined();
  });

  it("aggregates analytics for owners/admins only and computes period change", async () => {
    const { f, link } = await setup();
    const at = (iso: string) => new Date(iso);
    const base = {
      linkId: link.id,
      visitorHash: "v1",
      country: "US",
      region: null,
      city: null,
      browser: "Chrome",
      browserVersion: null,
      os: "Linux",
      osVersion: null,
      deviceType: "desktop" as const,
      referrerHost: null,
      referrerUrl: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      language: null,
      isBot: false,
    };
    await f.clickRepo.record({ ...base, occurredAt: at("2026-05-30T10:00:00Z") });
    await f.clickRepo.record({ ...base, visitorHash: "v2", occurredAt: at("2026-05-31T10:00:00Z") });
    await f.clickRepo.record({ ...base, isBot: true, occurredAt: at("2026-05-31T11:00:00Z") });
    await f.clickRepo.record({ ...base, occurredAt: at("2026-05-20T10:00:00Z") }); // previous period

    const result = await f.analytics.getLinkAnalytics(users.alice, link.id, {
      range: "7d",
      includeBots: false,
    });
    expect(result.summary).toEqual({ totalClicks: 2, uniqueVisitors: 2, botClicks: 1 });
    expect(result.previous.totalClicks).toBe(1);
    expect(result.changePct).toBe(100);
    expect(result.range.bucket).toBe("day");
    expect(result.timeseries.reduce((s, p) => s + p.clicks, 0)).toBe(2);
    expect(result.dimensions.country).toEqual([{ value: "US", clicks: 2 }]);
    expect(result.recent).toHaveLength(2);
    expect(Object.keys(result.recent[0] ?? {})).not.toContain("visitorHash");

    const hourly = await f.analytics.getLinkAnalytics(users.admin, link.id, {
      range: "24h",
      includeBots: true,
    });
    expect(hourly.range.bucket).toBe("hour");
    await expect(
      f.analytics.getLinkAnalytics(users.bob, link.id, { range: "7d", includeBots: false }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("validates custom ranges and supports all-time", async () => {
    const { f, link } = await setup();
    await expect(
      f.analytics.getLinkAnalytics(users.alice, link.id, { range: "custom", includeBots: false }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      f.analytics.getLinkAnalytics(users.alice, link.id, {
        range: "custom",
        from: new Date("2026-02-01"),
        to: new Date("2026-01-01"),
        includeBots: false,
      }),
    ).rejects.toThrow(/before/);
    await expect(
      f.analytics.getLinkAnalytics(users.alice, link.id, {
        range: "custom",
        from: new Date("2020-01-01"),
        to: new Date("2026-01-01"),
        includeBots: false,
      }),
    ).rejects.toThrow(/two years/);
    const all = await f.analytics.getLinkAnalytics(users.alice, link.id, {
      range: "all",
      includeBots: false,
    });
    expect(all.timeseries.length).toBeGreaterThan(0);
    const stats = await f.analytics.getLinkStats(users.alice, link.id);
    expect(stats.totalClicks).toBe(0);
  });

  it("streams CSV with a header and escaped rows", async () => {
    const { f, link } = await setup();
    await f.analytics.recordClick({
      linkId: link.id,
      ip: "1.2.3.4",
      headers: new Headers({ "user-agent": BROWSER }),
      searchParams: new URLSearchParams("utm_source=%3Dcmd"),
    });
    f.clock.advance(1000); // ranges are [from, to)
    const stream = await f.analytics.exportClicksCsv(users.alice, link.id, {
      range: "7d",
      includeBots: true,
    });
    const text = await new Response(stream).text();
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toMatch(/^occurred_at,country/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("'=cmd");
    expect(text).not.toContain("1.2.3.4");
  });
});

describe("ApiKeyService", () => {
  it("creates keys shown once, authenticates, touches and revokes", async () => {
    const f = buildFixture();
    f.userRepo.rows.push({ id: "alice", email: "a@x.io", name: "A", role: "user", banned: false });
    const { key, secret } = await f.apiKeys.create(users.alice, "  CI  ");
    expect(secret).toMatch(/^tw_[A-Za-z0-9_-]{43}$/);
    expect(key).toMatchObject({ name: "CI", prefix: secret.slice(0, 11), revokedAt: null });
    expect(JSON.stringify(f.apiKeyRepo.rows)).not.toContain(secret);

    const principal = await f.apiKeys.authenticate(secret);
    expect(principal?.actor).toEqual({ kind: "user", userId: "alice", role: "user" });
    expect(f.apiKeyRepo.rows[0]?.lastUsedAt).not.toBeNull();

    expect(await f.apiKeys.authenticate(`${secret}x`)).toBeNull();
    expect(await f.apiKeys.authenticate("Bearer junk")).toBeNull();
    expect(await f.apiKeys.authenticate(`${secret.slice(0, 11)}${"A".repeat(43)}`)).toBeNull();

    expect(await f.apiKeys.list(users.alice)).toHaveLength(1);
    await expect(f.apiKeys.revoke(users.bob, key.id)).rejects.toBeInstanceOf(NotFoundError);
    await f.apiKeys.revoke(users.alice, key.id);
    expect(await f.apiKeys.authenticate(secret)).toBeNull();
  });

  it("rejects banned users, bad names and anonymous actors", async () => {
    const f = buildFixture();
    f.userRepo.rows.push({ id: "alice", email: "a@x.io", name: "A", role: "admin", banned: true });
    const { secret } = await f.apiKeys.create(users.alice, "k");
    expect(await f.apiKeys.authenticate(secret)).toBeNull();
    await expect(f.apiKeys.create(users.alice, " ")).rejects.toBeInstanceOf(ValidationError);
    await expect(f.apiKeys.create(users.anon, "k")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("SettingsService + AdminService", () => {
  it("overlays DB overrides on env defaults and lets admins reset to default", async () => {
    const f = buildFixture({ allowAnonymousLinks: false });
    expect((await f.settings.get()).allowAnonymousLinks).toBe(false);
    await f.settings.update(users.admin, {
      allowAnonymousLinks: true,
      blockedDomains: ["https://Evil.example/x", "evil.example", "bad.test", "#x"],
      anonLinkTtlHours: 48,
    });
    expect(await f.settings.get()).toEqual({
      allowAnonymousLinks: true,
      allowSignups: true,
      anonLinkTtlHours: 48,
      blockedDomains: ["bad.test", "evil.example"],
    });
    await f.settings.update(users.admin, { allowAnonymousLinks: null });
    expect((await f.settings.get()).allowAnonymousLinks).toBe(false);
    const detailed = await f.settings.getDetailed();
    expect(detailed.overrides.anonLinkTtlHours).toBe(48);
    await expect(f.settings.update(users.alice, { allowSignups: false })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(f.settings.update(users.admin, { anonLinkTtlHours: 0 })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(() =>
      SettingsService.normalizeDomains(Array.from({ length: 5001 }, (_, i) => `d${i}.test`)),
    ).toThrow();
  });

  it("gracefully falls back to environment defaults when DB repository throws", async () => {
    const brokenRepo = {
      get: async () => {
        throw new Error("DB connection failure");
      },
      upsert: async () => {
        throw new Error("DB connection failure");
      },
      getOrCreateDailySalt: async () => {
        throw new Error("DB connection failure");
      },
    };
    const defaults = {
      allowAnonymousLinks: true,
      allowSignups: true,
      anonLinkTtlHours: 720,
      blockedDomains: [],
    };
    const service = new SettingsService(brokenRepo, defaults);
    expect(await service.get()).toEqual(defaults);
    const detailed = await service.getDetailed();
    expect(detailed.effective).toEqual(defaults);
  });

  it("blocks links to newly blocked domains", async () => {
    const f = buildFixture();
    await f.settings.update(users.admin, { blockedDomains: ["spam.test"] });
    await expect(
      f.links.create(users.alice, { destinationUrl: "https://x.spam.test" }, { ip: null }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns instance stats to admins only", async () => {
    const f = buildFixture();
    await f.links.create(users.alice, { destinationUrl: "https://a.example" }, { ip: null });
    expect(await f.admin.stats(users.admin)).toEqual({ users: 0, links: 1, clicks: 0, clicks24h: 0 });
    await expect(f.admin.stats(users.alice)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("QrService", () => {
  it("renders SVG/PNG on demand with link colours and validates colours", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://a.example", qrFgColor: "#112233", qrBgColor: "#FFEEDD" },
      { ip: null },
    );
    const svg = await f.qr.forOwnedLink(users.alice, link.id, "svg");
    expect(svg.contentType).toContain("image/svg+xml");
    expect(String(svg.body)).toContain("#112233");
    const png = await f.qr.forOwnedLink(users.alice, link.id, "png", { size: 256 });
    expect(png.contentType).toBe("image/png");
    expect(Array.from((png.body as Uint8Array).slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
    await expect(f.qr.render("x", "svg", { fg: "red" })).rejects.toBeInstanceOf(ValidationError);
    await expect(f.qr.forOwnedLink(users.bob, link.id, "svg")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await f.qr.forPublicCode(link.code, "svg")).not.toBeNull();
    expect(await f.qr.forPublicCode("nope", "svg")).toBeNull();
  });
});

describe("adapters", () => {
  it("memory rate limiter uses fixed windows", async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(() => now);
    expect((await limiter.consume("k", 2, 1000)).allowed).toBe(true);
    const second = await limiter.consume("k", 2, 1000);
    expect(second).toMatchObject({ allowed: true, remaining: 0, resetAt: 1000 });
    expect((await limiter.consume("k", 2, 1000)).allowed).toBe(false);
    now = 1001;
    expect((await limiter.consume("k", 2, 1000)).allowed).toBe(true);
    now = 120_000;
    expect((await limiter.consume("other", 1, 1000)).allowed).toBe(true);
  });

  it("argon2id hashes and verifies; bcrypt hashes verify and need rehash", async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash("hunter22");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await hasher.verify(hash, "hunter22")).toEqual({ valid: true, needsRehash: false });
    expect(await hasher.verify(hash, "nope")).toEqual({ valid: false, needsRehash: false });
    const legacy = hashSync("old-pass", 4);
    expect(await hasher.verify(legacy, "old-pass")).toEqual({ valid: true, needsRehash: true });
    expect(await hasher.verify(legacy, "wrong")).toEqual({ valid: false, needsRehash: false });
    expect(await hasher.verify("garbage", "x")).toEqual({ valid: false, needsRehash: false });
  });

  it("header geo resolver reads trusted CDN headers; chain falls through", async () => {
    const headers = new Headers({ "cf-ipcountry": "de", "cf-ipcity": "M%C3%BCnchen" });
    expect(await new HeaderGeoResolver().resolve({ ip: null, headers })).toEqual({
      country: "DE",
      region: null,
      city: "München",
    });
    expect(
      (await new HeaderGeoResolver().resolve({ ip: null, headers: new Headers({ "cf-ipcountry": "XX" }) }))
        .country,
    ).toBeNull();
    const chain = new ChainGeoResolver([
      { resolve: async () => ({ country: null, region: null, city: null }) },
      { resolve: async () => ({ country: "JP", region: null, city: null }) },
    ]);
    expect((await chain.resolve({ ip: "1.1.1.1", headers: new Headers() })).country).toBe("JP");
    expect((await new ChainGeoResolver([]).resolve({ ip: null, headers: new Headers() })).country).toBeNull();
  });

  it("Safe Browsing and Turnstile adapters interpret API responses and fail safely", async () => {
    const json = (body: unknown, ok = true) =>
      (async () => ({ ok, status: ok ? 200 : 500, json: async () => body })) as unknown as typeof fetch;
    expect(
      await new SafeBrowsingChecker("k", json({ matches: [{ threatType: "MALWARE" }] })).check("https://x"),
    ).toEqual({
      safe: false,
      reason: "MALWARE",
    });
    expect(await new SafeBrowsingChecker("k", json({})).check("https://x")).toEqual({ safe: true });
    expect(await new SafeBrowsingChecker("k", json({}, false)).check("https://x")).toEqual({ safe: true });
    const failing = (async () => Promise.reject(new Error("net"))) as unknown as typeof fetch;
    expect(await new SafeBrowsingChecker("k", failing).check("https://x")).toEqual({ safe: true });

    expect(
      await new TurnstileVerifier("site", "secret", json({ success: true })).verify("tok", "1.1.1.1"),
    ).toBe(true);
    expect(await new TurnstileVerifier("site", "secret", json({ success: false })).verify("tok", null)).toBe(
      false,
    );
    expect(
      await new TurnstileVerifier("site", "secret", json({ success: true })).verify(undefined, null),
    ).toBe(false);
    expect(await new TurnstileVerifier("site", "secret", failing).verify("tok", null)).toBe(false);
  });
});

describe("domain errors", () => {
  it("instanceof works across bundled module copies (brand-based)", () => {
    // Simulate an error created by a different copy of errors.ts: same brand, different class.
    const foreign = Object.assign(new Error("Incorrect password"), {
      [Symbol.for("vialb.DomainError")]: true,
      code: "VALIDATION_ERROR",
    });
    expect(foreign instanceof ValidationError).toBe(true);
    expect(foreign instanceof NotFoundError).toBe(false);
    expect(mapError(foreign).status).toBe(400);
    expect(new RateLimitedError(5) instanceof RateLimitedError).toBe(true);
    expect(new Error("x") instanceof ValidationError).toBe(false);
    expect(new NotFoundError().name).toBe("NotFoundError");
  });
});

describe("error mapper", () => {
  it("maps domain errors to statuses and the shared error shape", () => {
    expect(mapError(new NotFoundError()).status).toBe(404);
    expect(mapError(new ForbiddenError()).status).toBe(403);
    expect(mapError(new UnauthorizedError()).status).toBe(401);
    const limited = mapError(new RateLimitedError(30));
    expect(limited).toMatchObject({ status: 429, headers: { "Retry-After": "30" } });
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    const zod = mapError(z.object({ a: z.string() }).safeParse({}).error);
    expect(zod.status).toBe(400);
    expect(zod.body.error.details).toBeDefined();
    const unknown = mapError(new Error("secret internals"));
    expect(unknown).toMatchObject({
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
    });
  });
});
