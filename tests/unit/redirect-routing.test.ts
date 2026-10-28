import { describe, expect, it, vi } from "vitest";
import type { RoutingRule } from "@/lib/routing";
import { ValidationError } from "@/server/errors";
import type { GeoResolver } from "@/server/ports/geo-resolver";
import type { UrlSafetyChecker } from "@/server/ports/url-safety-checker";
import { buildFixture, users, type FixtureOptions } from "../support/fixtures";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const PIXEL =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SMART_TV =
  "Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 108.0.5359.1/7.0 TV Safari/537.36";
const SLACKBOT = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";

const APP_STORE = "https://apps.apple.com/app/id1";
const PLAY_STORE = "https://play.google.com/store/apps/details?id=app";
const WEBSITE = "https://app.example/";

function geoIn(country: string | null): GeoResolver & { resolve: ReturnType<typeof vi.fn> } {
  return { resolve: vi.fn(async () => ({ country, region: null, city: null })) };
}

async function setup(rules: RoutingRule[], options: FixtureOptions = {}) {
  const f = buildFixture(options);
  const { link } = await f.links.create(
    users.alice,
    { destinationUrl: WEBSITE, routingRules: rules },
    { ip: null },
  );
  const visit = (userAgent: string | null, query = "") =>
    f.redirect.resolve({
      code: link.code,
      userAgent,
      searchParams: new URLSearchParams(query),
      ip: "203.0.113.9",
      headers: new Headers(),
    });
  return { f, link, visit };
}

const appRules: RoutingRule[] = [
  { platform: "ios", url: APP_STORE },
  { platform: "android", url: PLAY_STORE },
];

describe("smart routing on the redirect path", () => {
  it("sends iPhone, Android and desktop visitors to their own destination", async () => {
    const { visit } = await setup(appRules);
    expect(await visit(IPHONE)).toMatchObject({ kind: "redirect", destination: APP_STORE, routedBy: "ios" });
    expect(await visit(PIXEL)).toMatchObject({
      kind: "redirect",
      destination: PLAY_STORE,
      routedBy: "android",
    });
    expect(await visit(WINDOWS)).toMatchObject({
      kind: "redirect",
      destination: WEBSITE,
      routedBy: "default",
    });
  });

  it("uses the normal destination, with no label, when a link has no rules", async () => {
    const { visit } = await setup([]);
    expect(await visit(IPHONE)).toMatchObject({ kind: "redirect", destination: WEBSITE, routedBy: null });
  });

  it("falls back to the default for visitors it cannot place", async () => {
    const { visit } = await setup([{ platform: "desktop", url: "https://desktop.example/" }]);
    expect(await visit(SMART_TV)).toMatchObject({ destination: WEBSITE, routedBy: "default" });
    expect(await visit(null)).toMatchObject({ destination: WEBSITE, routedBy: "default" });
  });

  it("forwards the query string to the chosen destination", async () => {
    const { visit } = await setup(appRules);
    expect(await visit(IPHONE, "utm_source=qr&ref=1")).toMatchObject({
      destination: `${APP_STORE}?utm_source=qr&ref=1`,
    });
  });

  it("does not forward the query when that is switched off", async () => {
    const { visit } = await setup(appRules, { forwardQueryParams: false });
    expect(await visit(IPHONE, "utm_source=qr")).toMatchObject({ destination: APP_STORE });
  });

  it("counts one access whichever destination is chosen, so limits still hold", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, maxClicks: 1, routingRules: appRules },
      { ip: null },
    );
    const request = (userAgent: string) => ({
      code: link.code,
      userAgent,
      searchParams: new URLSearchParams(),
    });
    expect(await f.redirect.resolve(request(IPHONE))).toMatchObject({
      kind: "redirect",
      destination: APP_STORE,
    });
    expect(await f.redirect.resolve(request(PIXEL))).toEqual({ kind: "gone", reason: "limit" });
  });

  it("keeps the default destination for link-preview bots and never lists the rule targets", async () => {
    const { visit } = await setup(appRules);
    const decision = await visit(SLACKBOT);
    expect(decision.kind).toBe("preview");
    if (decision.kind !== "preview") return;
    expect(decision.html).toContain("app.example");
    expect(decision.html).not.toContain("apple.com");
    expect(decision.html).not.toContain("google.com");
  });

  it("routes after a password is entered", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, password: "open-sesame", routingRules: appRules },
      { ip: null },
    );
    expect(
      await f.redirect.resolve({ code: link.code, userAgent: IPHONE, searchParams: new URLSearchParams() }),
    ).toEqual({ kind: "password" });
    const unlocked = await f.redirect.unlock({
      code: link.code,
      password: "open-sesame",
      ip: "203.0.113.9",
      userAgent: IPHONE,
    });
    expect(unlocked).toMatchObject({ destination: APP_STORE, routedBy: "ios" });
  });
});

describe("country rules", () => {
  const euRules: RoutingRule[] = [
    { platform: "ios", countries: ["FR"], url: "https://fr-ios.example/" },
    { countries: ["FR", "DE"], url: "https://eu.example/" },
  ];

  it("routes by the visitor's country and combines it with the device", async () => {
    const { visit } = await setup(euRules, { geo: geoIn("FR") });
    expect(await visit(IPHONE)).toMatchObject({
      destination: "https://fr-ios.example/",
      routedBy: "ios+country:FR",
    });
    expect(await visit(WINDOWS)).toMatchObject({
      destination: "https://eu.example/",
      routedBy: "country:FR",
    });
  });

  it("falls back to the default when the country matches no rule", async () => {
    const { visit } = await setup(euRules, { geo: geoIn("US") });
    expect(await visit(IPHONE)).toMatchObject({ destination: WEBSITE, routedBy: "default" });
  });

  it("skips country rules, but not device rules, when the country is unknown", async () => {
    const { visit } = await setup([...euRules, { platform: "android", url: PLAY_STORE }], {
      geo: geoIn(null),
    });
    expect(await visit(IPHONE)).toMatchObject({ destination: WEBSITE, routedBy: "default" });
    expect(await visit(PIXEL)).toMatchObject({ destination: PLAY_STORE, routedBy: "android" });
  });

  it("works without any geolocation configured", async () => {
    const f = buildFixture();
    // A bare redirect service: no `geo` dependency at all.
    const { RedirectService } = await import("@/server/services/redirect.service");
    const bare = new RedirectService({
      links: f.linkRepo,
      clock: f.clock,
      hasher: f.hasher,
      limiter: f.limiter,
      siteName: "Vialb",
      siteUrl: "https://sho.rt",
      forwardQueryParams: true,
    });
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, routingRules: euRules },
      { ip: null },
    );
    expect(
      await bare.resolve({ code: link.code, userAgent: IPHONE, searchParams: new URLSearchParams() }),
    ).toMatchObject({ destination: WEBSITE, routedBy: "default" });
  });

  it("never breaks the redirect when the lookup fails", async () => {
    const geo: GeoResolver = {
      resolve: vi.fn(async () => {
        throw new Error("mmdb unreadable");
      }),
    };
    const { visit } = await setup(euRules, { geo });
    expect(await visit(IPHONE)).toMatchObject({
      kind: "redirect",
      destination: WEBSITE,
      routedBy: "default",
    });
  });

  it("passes the client IP and headers to the resolver", async () => {
    const geo = geoIn("FR");
    const { f, link } = await setup(euRules, { geo });
    const headers = new Headers({ "cf-ipcountry": "FR" });
    await f.redirect.resolve({
      code: link.code,
      userAgent: IPHONE,
      searchParams: new URLSearchParams(),
      ip: "198.51.100.4",
      headers,
    });
    expect(geo.resolve).toHaveBeenCalledWith({ ip: "198.51.100.4", headers });
  });

  it("looks the country up only for links whose rules need it", async () => {
    const geo = geoIn("FR");
    const deviceOnly = await setup(appRules, { geo });
    await deviceOnly.visit(IPHONE);
    const noRules = await setup([], { geo });
    await noRules.visit(IPHONE);
    expect(geo.resolve).not.toHaveBeenCalled();

    const withCountries = await setup(euRules, { geo });
    await withCountries.visit(IPHONE);
    expect(geo.resolve).toHaveBeenCalledTimes(1);
  });
});

describe("LinkService routing rules", () => {
  async function create(rules: RoutingRule[], options: FixtureOptions = {}) {
    const f = buildFixture(options);
    return {
      f,
      result: f.links.create(users.alice, { destinationUrl: WEBSITE, routingRules: rules }, { ip: null }),
    };
  }

  it("stores normalized rules: trimmed URL, upper-case unique countries, only what is set", async () => {
    const { result } = await create([
      { platform: "ios", countries: [" fr", "FR", "de"], url: ` ${APP_STORE} ` },
      { countries: [], platform: "android", url: PLAY_STORE },
    ]);
    expect((await result).link.routingRules).toEqual([
      { platform: "ios", countries: ["FR", "DE"], url: APP_STORE },
      { platform: "android", url: PLAY_STORE },
    ]);
  });

  it("defaults to no rules", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(users.alice, { destinationUrl: WEBSITE }, { ip: null });
    expect(link.routingRules).toEqual([]);
  });

  it.each([
    ["a rule without conditions", [{ url: APP_STORE }], /choose a device/],
    ["a bad country", [{ countries: ["USA"], url: APP_STORE }], /two-letter/],
    [
      "duplicate conditions",
      [
        { platform: "ios" as const, url: APP_STORE },
        { platform: "ios" as const, url: PLAY_STORE },
      ],
      /same conditions/,
    ],
    [
      "an unknown device",
      [{ platform: "windows-phone" as unknown as "ios", url: APP_STORE }],
      /Unknown device/,
    ],
  ])("rejects %s", async (_name, rules, message) => {
    const { result } = await create(rules);
    await expect(result).rejects.toMatchObject({
      constructor: ValidationError,
      message: expect.stringMatching(message),
      details: { field: "routingRules" },
    });
  });

  it("rejects too many rules", async () => {
    const rules = Array.from({ length: 11 }, (_, i) => ({
      countries: [`A${String.fromCharCode(65 + i)}`],
      url: `https://t${i}.example/`,
    }));
    const { result } = await create(rules);
    await expect(result).rejects.toThrow(/at most 10 routing rules/);
  });

  it("checks every target like a normal destination: blocklist, scheme and own host", async () => {
    for (const url of ["https://bad.example/x", "javascript:alert(1)", "https://sho.rt/loop"]) {
      const { result } = await create([{ platform: "ios", url }], { blockedDomains: ["bad.example"] });
      await expect(result).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("asks Safe Browsing about rule targets too", async () => {
    const safety: UrlSafetyChecker = {
      isConfigured: true,
      check: vi.fn(async (url: string) => ({ safe: !url.includes("phish") })),
    };
    const { result } = await create([{ platform: "ios", url: "https://phish.example/" }], { safety });
    await expect(result).rejects.toBeInstanceOf(ValidationError);
  });

  it("replaces, clears and keeps rules on update", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, routingRules: appRules },
      { ip: null },
    );
    expect((await f.links.update(users.alice, link.id, { title: "Renamed" })).routingRules).toEqual(appRules);
    expect(
      (await f.links.update(users.alice, link.id, { routingRules: [{ countries: ["us"], url: WEBSITE }] }))
        .routingRules,
    ).toEqual([{ countries: ["US"], url: WEBSITE }]);
    expect((await f.links.update(users.alice, link.id, { routingRules: [] })).routingRules).toEqual([]);
  });

  it("only re-checks targets that are new when a link is edited", async () => {
    const check = vi.fn(async () => ({ safe: true }));
    const f = buildFixture({ safety: { isConfigured: true, check } });
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, routingRules: appRules },
      { ip: null },
    );
    check.mockClear();
    await f.links.update(users.alice, link.id, {
      routingRules: [...appRules, { platform: "desktop", url: "https://new.example/" }],
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith("https://new.example/");
  });

  it("does not let someone else change the rules", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(users.alice, { destinationUrl: WEBSITE }, { ip: null });
    await expect(f.links.update(users.bob, link.id, { routingRules: appRules })).rejects.toThrow();
    expect((await f.links.get(users.alice, link.id)).routingRules).toEqual([]);
  });

  it("records which rule sent the visitor, and nothing for links without rules", async () => {
    const f = buildFixture();
    const routed = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, routingRules: appRules },
      { ip: null },
    );
    const plain = await f.links.create(users.alice, { destinationUrl: WEBSITE }, { ip: null });
    const headers = new Headers({ "user-agent": IPHONE });
    const searchParams = new URLSearchParams();
    await f.analytics.recordClick({
      linkId: routed.link.id,
      ip: null,
      headers,
      searchParams,
      routedBy: "ios",
    });
    await f.analytics.recordClick({ linkId: plain.link.id, ip: null, headers, searchParams });
    expect(f.clickRepo.rows.map((click) => click.routedBy)).toEqual(["ios", null]);
  });

  it("leaves imported links without rules", async () => {
    const f = buildFixture();
    const [result] = await f.links.importLinks(users.alice, [{ row: 1, destinationUrl: WEBSITE }]);
    expect(result?.status).toBe("created");
    const page = await f.links.list(users.alice, {});
    expect(page.items[0]?.routingRules).toEqual([]);
  });
});
