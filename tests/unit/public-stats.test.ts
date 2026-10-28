import { describe, expect, it } from "vitest";
import { RATE_LIMITS, RESERVED_CODES } from "@/lib/constants";
import { ForbiddenError, RateLimitedError, ValidationError } from "@/server/errors";
import { buildFixture, defined, users } from "../support/fixtures";

const DAY = 86_400_000;

const tokenOf = (url: string | null) => defined(url?.split("/").pop(), "a stats address");

async function seed() {
  const f = buildFixture();
  const { link } = await f.links.create(
    users.alice,
    { destinationUrl: "https://a.example/secret-campaign?x=1", customCode: "promo", title: "Spring sale" },
    { ip: null },
  );
  return { f, link };
}

function click(
  f: ReturnType<typeof buildFixture>,
  linkId: string,
  daysAgo: number,
  extra: Record<string, unknown> = {},
) {
  return f.clickRepo.record({
    linkId,
    occurredAt: new Date(f.clock.now().getTime() - daysAgo * DAY),
    visitorHash: `hash-${Math.random()}`,
    country: "FR",
    region: "IDF",
    city: "Paris",
    browser: "Chrome",
    browserVersion: "130",
    os: "Windows",
    osVersion: "11",
    deviceType: "desktop",
    referrerHost: "news.example",
    referrerUrl: "https://news.example/story?token=abc",
    utmSource: "newsletter",
    utmMedium: "email",
    utmCampaign: "internal-launch-q3",
    utmTerm: null,
    utmContent: null,
    language: "fr",
    isBot: false,
    routedBy: "ios",
    ...extra,
  });
}

describe("LinkService.setPublicStats", () => {
  it("turns the page on, keeps the address when asked again, rotates it, and turns it off", async () => {
    const { f, link } = await seed();
    expect(link.statsUrl).toBeNull();

    const on = await f.links.setPublicStats(users.alice, link.id, "enable");
    expect(on.statsUrl).toMatch(/^https:\/\/sho\.rt\/stats\/[A-Za-z0-9_-]{22}$/);
    const again = await f.links.setPublicStats(users.alice, link.id, "enable");
    expect(again.statsUrl).toBe(on.statsUrl);

    const rotated = await f.links.setPublicStats(users.alice, link.id, "rotate");
    expect(rotated.statsUrl).not.toBe(on.statsUrl);

    const off = await f.links.setPublicStats(users.alice, link.id, "disable");
    expect(off.statsUrl).toBeNull();
    expect(await f.links.findByStatsToken(tokenOf(on.statsUrl))).toBeNull();
  });

  it("uses long random tokens that differ every time", async () => {
    const { f, link } = await seed();
    const tokens = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const dto = await f.links.setPublicStats(users.alice, link.id, "rotate");
      tokens.add(tokenOf(dto.statsUrl));
    }
    expect(tokens.size).toBe(25);
    for (const token of tokens) expect(token.length).toBeGreaterThanOrEqual(22);
  });

  it("is limited to people who may edit the link", async () => {
    const { f, link } = await seed();
    await expect(f.links.setPublicStats(users.bob, link.id, "enable")).rejects.toThrow(ForbiddenError);
    const viewer = { ...users.alice, workspace: { id: "ws-alice", role: "viewer" as const } };
    await expect(f.links.setPublicStats(viewer, link.id, "enable")).rejects.toThrow(ForbiddenError);
  });

  it("can also be switched through a normal update (the REST API)", async () => {
    const { f, link } = await seed();
    const on = await f.links.update(users.alice, link.id, { publicStats: true });
    expect(on.statsUrl).not.toBeNull();
    expect((await f.links.update(users.alice, link.id, { title: "x" })).statsUrl).toBe(on.statsUrl);
    expect((await f.links.update(users.alice, link.id, { publicStats: true })).statsUrl).toBe(on.statsUrl);
    expect((await f.links.update(users.alice, link.id, { publicStats: false })).statsUrl).toBeNull();
  });

  it("does not apply to bio-page buttons", async () => {
    const { f } = await seed();
    const button = await f.linkRepo.create({
      code: "bio-x",
      destinationUrl: "https://b.example/",
      kind: "bio_button",
      workspaceId: "ws-alice",
      userId: "alice",
    });
    await expect(f.links.setPublicStats(users.alice, button.id, "enable")).rejects.toThrow(ValidationError);
  });
});

describe("AnalyticsService.getPublicStats", () => {
  async function published() {
    const { f, link } = await seed();
    const dto = await f.links.setPublicStats(users.alice, link.id, "enable");
    return { f, link, token: tokenOf(dto.statsUrl) };
  }

  it("returns aggregates for the last 30 days and nothing that identifies a visitor", async () => {
    const { f, link, token } = await published();
    for (let i = 0; i < 3; i++) await click(f, link.id, 1);
    await click(f, link.id, 2, { country: "DE", referrerHost: null, deviceType: "mobile" });
    await click(f, link.id, 5, { isBot: true });
    await click(f, link.id, 45); // outside the window

    const stats = await f.analytics.getPublicStats(token, "203.0.113.5");
    expect(stats).toMatchObject({ label: "Spring sale", code: "promo", totalClicks: 4 });
    expect(stats?.timeseries).toHaveLength(30);
    expect(stats?.timeseries.reduce((sum, p) => sum + p.clicks, 0)).toBe(4);
    expect(stats?.countries).toEqual([
      { value: "FR", clicks: 3 },
      { value: "DE", clicks: 1 },
    ]);
    expect(stats?.referrers).toEqual([
      { value: "news.example", clicks: 3 },
      { value: "Unknown", clicks: 1 },
    ]);
    expect(stats?.devices).toEqual([
      { value: "desktop", clicks: 3 },
      { value: "mobile", clicks: 1 },
    ]);

    // Whatever the shape, nothing private appears anywhere in it.
    const serialized = JSON.stringify(stats);
    for (const secret of [
      "hash-",
      "visitorHash",
      "Paris",
      "IDF",
      "Chrome",
      "newsletter",
      "internal-launch-q3",
      "token=abc",
      "secret-campaign",
      "a.example",
      "ios",
      "recent",
    ]) {
      expect(serialized, secret).not.toContain(secret);
    }
    expect(Object.keys(stats ?? {}).sort()).toEqual(
      [
        "code",
        "countries",
        "devices",
        "generatedAt",
        "label",
        "range",
        "referrers",
        "timeseries",
        "totalClicks",
        "uniqueVisitors",
      ].sort(),
    );
  });

  it("falls back to the short link when there is no title", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://a.example/", customCode: "plain" },
      { ip: null },
    );
    const dto = await f.links.setPublicStats(users.alice, link.id, "enable");
    expect((await f.analytics.getPublicStats(tokenOf(dto.statsUrl), null))?.label).toBe("/plain");
  });

  it("answers the same nothing for unknown, malformed, revoked and deleted tokens", async () => {
    const { f, link, token } = await published();
    expect(await f.analytics.getPublicStats("x".repeat(22), null)).toBeNull();
    expect(await f.analytics.getPublicStats("short", null)).toBeNull();
    expect(await f.analytics.getPublicStats("has space and ../", null)).toBeNull();
    expect(await f.analytics.getPublicStats(link.code, null)).toBeNull(); // the short code is not a token

    expect(await f.analytics.getPublicStats(token, null)).not.toBeNull();
    await f.links.setPublicStats(users.alice, link.id, "disable");
    expect(await f.analytics.getPublicStats(token, null)).toBeNull();

    const again = tokenOf((await f.links.setPublicStats(users.alice, link.id, "enable")).statsUrl);
    expect(again).not.toBe(token);
    expect(await f.analytics.getPublicStats(again, null)).not.toBeNull();
    await f.links.delete(users.alice, [link.id]);
    expect(await f.analytics.getPublicStats(again, null)).toBeNull();
  });

  it("keeps working for a disabled or expired link: the history is still theirs to share", async () => {
    const { f, link, token } = await published();
    await f.links.setEnabled(users.alice, [link.id], false);
    expect(await f.analytics.getPublicStats(token, null)).not.toBeNull();
  });

  it("rate limits by address, per minute", async () => {
    const { f, token } = await published();
    for (let i = 0; i < RATE_LIMITS.publicStats.limit; i++) {
      await f.analytics.getPublicStats(token, "198.51.100.9");
    }
    await expect(f.analytics.getPublicStats(token, "198.51.100.9")).rejects.toThrow(RateLimitedError);
    // Another address is unaffected.
    await expect(f.analytics.getPublicStats(token, "198.51.100.10")).resolves.not.toBeNull();
  });
});

describe("the stats route prefix", () => {
  it("is reserved so no short code can shadow it", () => {
    expect(RESERVED_CODES.has("stats")).toBe(true);
  });
});
