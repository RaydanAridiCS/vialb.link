import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { NewClick } from "@/server/domain/types";
import { DrizzleClickRepository } from "@/server/repositories/drizzle/click.repository.drizzle";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { connect, truncateAll } from "./helpers";

const { db, close } = connect();
const links = new DrizzleLinkRepository(db);
const repo = new DrizzleClickRepository(db);

afterAll(close);
beforeEach(() => truncateAll(db));

function click(linkId: string, occurredAt: string, overrides: Partial<NewClick> = {}): NewClick {
  return {
    linkId,
    occurredAt: new Date(occurredAt),
    visitorHash: "visitor-a",
    country: "US",
    region: null,
    city: "Austin",
    browser: "Chrome",
    browserVersion: "130",
    os: "macOS",
    osVersion: "15",
    deviceType: "desktop",
    referrerHost: "news.ycombinator.com",
    referrerUrl: null,
    utmSource: "hn",
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    language: "en-US",
    isBot: false,
    ...overrides,
  };
}

describe("DrizzleClickRepository analytics", () => {
  it("aggregates summary, zero-filled series, heatmap and dimensions in SQL", async () => {
    const link = await links.create({ code: "an", destinationUrl: "https://x.example" });
    await repo.record(click(link.id, "2026-03-02T10:15:00Z"));
    await repo.record(
      click(link.id, "2026-03-02T10:45:00Z", { visitorHash: "visitor-b", country: "DE", city: null }),
    );
    await repo.record(click(link.id, "2026-03-04T08:00:00Z", { country: null }));
    await repo.record(
      click(link.id, "2026-03-04T09:00:00Z", { isBot: true, deviceType: "bot", visitorHash: "bot" }),
    );

    const filter = {
      linkId: link.id,
      from: new Date("2026-03-01T00:00:00Z"),
      to: new Date("2026-03-06T00:00:00Z"),
      includeBots: false,
    };

    expect(await repo.summary(filter)).toEqual({ totalClicks: 3, uniqueVisitors: 2, botClicks: 1 });
    expect(await repo.summary({ ...filter, includeBots: true })).toEqual({
      totalClicks: 4,
      uniqueVisitors: 3,
      botClicks: 1,
    });

    const daily = await repo.timeseries(filter, "day");
    expect(daily.map((p) => [p.bucket.toISOString().slice(0, 10), p.clicks])).toEqual([
      ["2026-03-01", 0],
      ["2026-03-02", 2],
      ["2026-03-03", 0],
      ["2026-03-04", 1],
      ["2026-03-05", 0],
    ]);

    const hourly = await repo.timeseries(
      { ...filter, from: new Date("2026-03-02T09:00:00Z"), to: new Date("2026-03-02T12:00:00Z") },
      "hour",
    );
    expect(hourly.map((p) => p.clicks)).toEqual([0, 2, 0]);

    const heat = await repo.heatmap(filter);
    // 2026-03-02 is a Monday (dow 1).
    expect(heat).toContainEqual({ weekday: 1, hour: 10, clicks: 2 });

    // Ties are ordered by the database collation, so compare as a set.
    const countries = await repo.topDimension(filter, "country", 10);
    expect(countries).toHaveLength(3);
    expect(countries).toEqual(
      expect.arrayContaining([
        { value: "DE", clicks: 1 },
        { value: "Unknown", clicks: 1 },
        { value: "US", clicks: 1 },
      ]),
    );
    expect(await repo.topDimension(filter, "referrer_host", 10)).toEqual([
      { value: "news.ycombinator.com", clicks: 3 },
    ]);

    const recent = await repo.recent(filter, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.occurredAt.toISOString()).toBe("2026-03-04T08:00:00.000Z");

    const batches: number[] = [];
    for await (const batch of repo.iterate({ ...filter, includeBots: true }, 3)) batches.push(batch.length);
    expect(batches).toEqual([3, 1]);

    expect(await repo.firstClickAt(link.id)).toEqual(new Date("2026-03-02T10:15:00Z"));
    expect(await repo.count()).toBe(4);
    expect(await repo.count(new Date("2026-03-04T00:00:00Z"))).toBe(2);
  });

  it("returns an all-zero series when there are no clicks", async () => {
    const link = await links.create({ code: "empty", destinationUrl: "https://x.example" });
    const series = await repo.timeseries(
      {
        linkId: link.id,
        from: new Date("2026-01-01T00:00:00Z"),
        to: new Date("2026-01-08T00:00:00Z"),
        includeBots: false,
      },
      "day",
    );
    expect(series).toHaveLength(7);
    expect(series.every((p) => p.clicks === 0)).toBe(true);
  });
});
