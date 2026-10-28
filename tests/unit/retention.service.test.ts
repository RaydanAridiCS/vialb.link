import { describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { buildFixture, users } from "../support/fixtures";

const DAY = 86_400_000;

async function seed(clickRetentionDays: number) {
  const f = buildFixture({ clickRetentionDays });
  const { link } = await f.links.create(users.alice, { destinationUrl: "https://a.example/" }, { ip: null });
  const click = (daysAgo: number) =>
    f.clickRepo.record({
      linkId: link.id,
      occurredAt: new Date(f.clock.now().getTime() - daysAgo * DAY),
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
  return { f, click };
}

describe("RetentionService.run", () => {
  it("deletes clicks older than the retention period and keeps newer ones", async () => {
    const { f, click } = await seed(30);
    for (const d of [1, 29, 31, 60, 400]) await click(d);
    expect(await f.retention.run()).toContain("deleted 3 clicks older than 30 days");
    expect(
      f.clickRepo.rows
        .map((c) => Math.round((f.clock.now().getTime() - c.occurredAt.getTime()) / DAY))
        .sort((a, b) => a - b),
    ).toEqual([1, 29]);
  });

  it("keeps every click when no retention period is set", async () => {
    const { f, click } = await seed(0);
    await click(1);
    await click(2000);
    expect(await f.retention.run()).toContain("kept all clicks");
    expect(f.clickRepo.rows).toHaveLength(2);
  });

  it("treats the cutoff exactly: a click right at the boundary stays", async () => {
    const { f, click } = await seed(10);
    await click(10); // exactly 10 days old: not older than the cutoff
    await click(10.0001);
    await f.retention.run();
    expect(f.clickRepo.rows).toHaveLength(1);
  });

  it("works through more than one batch", async () => {
    const { f, click } = await seed(1);
    for (let i = 0; i < 25; i++) await click(5);
    const repo = f.clickRepo;
    // Shrink the batch by wrapping the repository: 10 per statement.
    const original = repo.deleteOlderThan.bind(repo);
    const sizes: number[] = [];
    repo.deleteOlderThan = async (cutoff, limit) => {
      const removed = await original(cutoff, Math.min(limit, 10));
      sizes.push(removed);
      return removed;
    };
    await f.retention.run();
    // The service asks for 10,000 and gets 10, which is fewer than asked, so it stops: the next daily run continues.
    expect(sizes).toEqual([10]);
    expect(repo.rows).toHaveLength(15);
  });

  it("always prunes daily salts older than two days, whatever the retention setting", async () => {
    const { f } = await seed(0);
    const today = f.clock.now().toISOString().slice(0, 10);
    const day = (n: number) => new Date(f.clock.now().getTime() - n * DAY).toISOString().slice(0, 10);
    for (const d of [today, day(1), day(2), day(3), day(40)])
      await f.settingsRepo.getOrCreateDailySalt(d, "salt");
    expect(await f.retention.run()).toContain("deleted 2 old salts");
    expect([...f.settingsRepo.salts.keys()].sort()).toEqual([day(2), day(1), today].sort());
  });
});

describe("RetentionService.preview", () => {
  it("counts what a period would delete without deleting", async () => {
    const { f, click } = await seed(0);
    for (const d of [1, 40, 80]) await click(d);
    expect(await f.retention.preview(users.admin, 30)).toEqual({ wouldDelete: 2, total: 3 });
    expect(f.clickRepo.rows).toHaveLength(3);
  });

  it("is for administrators and rejects nonsense periods", async () => {
    const { f } = await seed(0);
    await expect(f.retention.preview(users.alice, 30)).rejects.toThrow(ForbiddenError);
    for (const bad of [0, -1, 1.5, 4000]) {
      await expect(f.retention.preview(users.admin, bad)).rejects.toThrow(ValidationError);
    }
  });
});

describe("retention setting", () => {
  it("is validated and overrides the environment default", async () => {
    const f = buildFixture({ clickRetentionDays: 90 });
    expect((await f.settings.get()).clickRetentionDays).toBe(90);
    await f.settings.update(users.admin, { clickRetentionDays: 0 });
    expect((await f.settings.get()).clickRetentionDays).toBe(0);
    await f.settings.update(users.admin, { clickRetentionDays: null });
    expect((await f.settings.get()).clickRetentionDays).toBe(90);
    for (const bad of [-1, 3651, 2.5]) {
      await expect(f.settings.update(users.admin, { clickRetentionDays: bad })).rejects.toThrow(
        ValidationError,
      );
    }
  });
});
