import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleClickRepository } from "@/server/repositories/drizzle/click.repository.drizzle";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { DrizzleSettingsRepository } from "@/server/repositories/drizzle/settings.repository.drizzle";
import { connect, truncateAll } from "./helpers";

const { db, close } = connect();
const links = new DrizzleLinkRepository(db);
const clicks = new DrizzleClickRepository(db);
const settings = new DrizzleSettingsRepository(db);

afterAll(close);
beforeEach(() => truncateAll(db));

const DAY = 86_400_000;
const now = new Date("2026-06-01T12:00:00Z");

async function addClicks(linkId: string, daysAgo: number[]) {
  for (const d of daysAgo) {
    await clicks.record({
      linkId,
      occurredAt: new Date(now.getTime() - d * DAY),
      visitorHash: "v",
      country: null,
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
    });
  }
}

describe("clicks retention queries", () => {
  it("counts and deletes strictly older than the cutoff, oldest first, in batches", async () => {
    const link = await links.create({ code: "ret", destinationUrl: "https://a.example/" });
    await addClicks(link.id, [1, 5, 10, 20, 30, 40, 50]);
    const cutoff = new Date(now.getTime() - 15 * DAY);

    expect(await clicks.countOlderThan(cutoff)).toBe(4);
    expect(await clicks.deleteOlderThan(cutoff, 3)).toBe(3);
    expect(await clicks.countOlderThan(cutoff)).toBe(1);
    expect(await clicks.deleteOlderThan(cutoff, 3)).toBe(1);
    expect(await clicks.deleteOlderThan(cutoff, 3)).toBe(0);
    expect(await clicks.count()).toBe(3);
  });

  it("removes the oldest rows first when the batch is smaller than the backlog", async () => {
    const link = await links.create({ code: "old", destinationUrl: "https://a.example/" });
    await addClicks(link.id, [100, 300, 200]);
    await clicks.deleteOlderThan(now, 2);
    const left = await clicks.recent({ linkId: link.id, from: new Date(0), to: now, includeBots: true }, 10);
    expect(left.map((c) => Math.round((now.getTime() - c.occurredAt.getTime()) / DAY))).toEqual([100]);
  });

  it("leaves a link's own visit counter alone", async () => {
    const link = await links.create({ code: "ctr", destinationUrl: "https://a.example/", clickCount: 7 });
    await addClicks(link.id, [100]);
    await clicks.deleteOlderThan(now, 10);
    expect((await links.findById(link.id))?.clickCount).toBe(7);
  });

  it("uses the BRIN index on occurred_at for the cutoff scan", async () => {
    const rows = await db.execute<{ indexdef: string }>(
      `select indexdef from pg_indexes where indexname = 'clicks_occurred_brin'` as never,
    );
    expect([...rows][0]?.indexdef).toMatch(/USING brin \(occurred_at\)/);
  });
});

describe("daily salt pruning", () => {
  it("deletes salts before a day and keeps that day and later", async () => {
    for (const day of ["2026-05-01", "2026-05-29", "2026-05-30", "2026-06-01"]) {
      await settings.getOrCreateDailySalt(day, `salt-${day}`);
    }
    expect(await settings.deleteSaltsBefore("2026-05-30")).toBe(2);
    expect(await settings.getOrCreateDailySalt("2026-05-30", "new")).toBe("salt-2026-05-30");
    // A pruned day gets a fresh, different salt if it were ever asked for again.
    expect(await settings.getOrCreateDailySalt("2026-05-01", "fresh")).toBe("fresh");
  });
});
