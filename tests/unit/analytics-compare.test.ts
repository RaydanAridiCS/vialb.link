import { describe, expect, it } from "vitest";
import { alignPrevious, compareValue, previousFor } from "@/features/analytics/compare";
import { parseAnalyticsParams } from "@/features/analytics/schemas";
import { buildFixture, users } from "../support/fixtures";

const DAY = 86_400_000;

describe("compareValue", () => {
  it.each([
    [150, 100, { delta: 50, pct: 50, isNew: false }],
    [50, 100, { delta: -50, pct: -50, isNew: false }],
    [100, 100, { delta: 0, pct: 0, isNew: false }],
    [5, 0, { delta: 5, pct: null, isNew: true }],
    [0, 0, { delta: 0, pct: null, isNew: false }],
    [0, 8, { delta: -8, pct: -100, isNew: false }],
    [1, 3, { delta: -2, pct: -66.7, isNew: false }],
  ])("%i vs %i", (current, previous, expected) => {
    expect(compareValue(current, previous)).toEqual(expected);
  });
});

describe("previousFor / alignPrevious", () => {
  it("looks values up and treats a missing one as zero", () => {
    const previous = [{ value: "FR", clicks: 4 }];
    expect(previousFor(previous, "FR")).toBe(4);
    expect(previousFor(previous, "DE")).toBe(0);
    expect(previousFor(undefined, "FR")).toBe(0);
  });

  it("pairs the series by position, and leaves it alone without a previous period", () => {
    const current = [
      { bucket: "a", clicks: 1 },
      { bucket: "b", clicks: 2 },
    ];
    expect(alignPrevious(current, [{ clicks: 9 }])).toEqual([
      { bucket: "a", clicks: 1, previous: 9 },
      { bucket: "b", clicks: 2, previous: 0 },
    ]);
    expect(alignPrevious(current, undefined)).toEqual(current);
  });
});

describe("compare URL param", () => {
  it("is on unless explicitly 0", () => {
    expect(parseAnalyticsParams({}).compare).toBe(true);
    expect(parseAnalyticsParams({ compare: "1" }).compare).toBe(true);
    expect(parseAnalyticsParams({ compare: "0" }).compare).toBe(false);
    expect(parseAnalyticsParams({ compare: "garbage" }).compare).toBe(true);
  });
});

async function seed() {
  const f = buildFixture();
  const { link } = await f.links.create(users.alice, { destinationUrl: "https://a.example/" }, { ip: null });
  const click = (daysAgo: number, extra: Record<string, unknown> = {}) =>
    f.clickRepo.record({
      linkId: link.id,
      occurredAt: new Date(f.clock.now().getTime() - daysAgo * DAY),
      visitorHash: `v-${Math.random()}`,
      country: "FR",
      region: null,
      city: null,
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      deviceType: "desktop",
      referrerHost: null,
      referrerUrl: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      language: null,
      isBot: false,
      ...extra,
    });
  return { f, link, click };
}

describe("getLinkAnalytics: comparison", () => {
  it("returns the previous period's series and counts for exactly the values shown", async () => {
    const { f, link, click } = await seed();
    await click(1);
    await click(2);
    await click(2, { country: "DE" });
    await click(8); // previous 7 days
    await click(9, { country: "DE" });
    await click(10, { country: "US" }); // only in the previous period: not a row today

    const data = await f.analytics.getLinkAnalytics(users.alice, link.id, {
      range: "7d",
      includeBots: false,
    });
    expect(data.summary.totalClicks).toBe(3);
    expect(data.previous.totalClicks).toBe(3);
    expect(data.previousTimeseries).toHaveLength(data.timeseries.length);
    expect(data.previousTimeseries?.reduce((n, p) => n + p.clicks, 0)).toBe(3);
    expect(data.previousDimensions?.country).toEqual(
      expect.arrayContaining([
        { value: "FR", clicks: 1 },
        { value: "DE", clicks: 1 },
      ]),
    );
    expect(data.previousDimensions?.country.find((row) => row.value === "US")).toBeUndefined();
  });

  it("skips the extra queries when comparison is off, and for the all-time range", async () => {
    const { f, link, click } = await seed();
    await click(1);
    const off = await f.analytics.getLinkAnalytics(users.alice, link.id, {
      range: "7d",
      includeBots: false,
      compare: false,
    });
    expect(off.previousTimeseries).toBeUndefined();
    expect(off.previousDimensions).toBeUndefined();
    const all = await f.analytics.getLinkAnalytics(users.alice, link.id, {
      range: "all",
      includeBots: false,
    });
    expect(all.previousDimensions).toBeUndefined();
  });

  it("counts previous-period bots only when bots are included", async () => {
    const { f, link, click } = await seed();
    await click(1);
    await click(9, { isBot: true });
    const human = await f.analytics.getLinkAnalytics(users.alice, link.id, {
      range: "7d",
      includeBots: false,
    });
    expect(human.previous.totalClicks).toBe(0);
    expect(human.previousDimensions?.country).toEqual([]);
    const all = await f.analytics.getLinkAnalytics(users.alice, link.id, { range: "7d", includeBots: true });
    expect(all.previous.totalClicks).toBe(1);
    expect(all.previousDimensions?.country).toEqual([{ value: "FR", clicks: 1 }]);
  });
});

describe("getLinkAnalytics: unique visitors per bucket", () => {
  it("counts a visitor once per day bucket and again on another day", async () => {
    const { f, link, click } = await seed();
    const same = { visitorHash: "same-person" };
    await click(1, same);
    await click(1, same);
    await click(1, { visitorHash: "other" });
    await click(2, same); // the same hash on another day (cannot happen for real: salts rotate; counted as new)
    const data = await f.analytics.getLinkAnalytics(users.alice, link.id, {
      range: "7d",
      includeBots: false,
    });
    const perDay = data.uniqueTimeseries?.map((p) => p.visitors) ?? [];
    expect(perDay.reduce((n, v) => n + v, 0)).toBe(3);
    expect(Math.max(...perDay)).toBe(2);
    expect(data.summary.uniqueVisitors).toBe(2); // distinct hashes overall
  });
});
