import { describe, expect, it, vi } from "vitest";
import { lastScheduledInstant, periodKeyFor } from "@/server/lib/schedule";
import { periodLabel } from "@/server/services/report.service";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { FakeClock, buildFixture, defined, users } from "../support/fixtures";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("lastScheduledInstant", () => {
  // 2026-06-01 is a Monday.
  it("returns the same day when the hour has passed", () => {
    const now = new Date("2026-06-01T09:30:00Z");
    expect(lastScheduledInstant(now, 1, 8)).toEqual(new Date("2026-06-01T08:00:00Z"));
  });

  it("steps back a whole week when today's hour has not come yet", () => {
    const now = new Date("2026-06-01T07:59:59Z");
    expect(lastScheduledInstant(now, 1, 8)).toEqual(new Date("2026-05-25T08:00:00Z"));
  });

  it("treats the exact instant as arrived", () => {
    const now = new Date("2026-06-01T08:00:00Z");
    expect(lastScheduledInstant(now, 1, 8)).toEqual(now);
  });

  it("finds the latest matching weekday before today", () => {
    const wednesday = new Date("2026-06-03T12:00:00Z");
    expect(lastScheduledInstant(wednesday, 1, 8)).toEqual(new Date("2026-06-01T08:00:00Z"));
    expect(lastScheduledInstant(wednesday, 0, 23)).toEqual(new Date("2026-05-31T23:00:00Z"));
    expect(lastScheduledInstant(wednesday, 5, 0)).toEqual(new Date("2026-05-29T00:00:00Z"));
  });

  it("works across month and year boundaries", () => {
    expect(lastScheduledInstant(new Date("2027-01-02T00:00:00Z"), 1, 8)).toEqual(
      new Date("2026-12-28T08:00:00Z"),
    );
  });

  it("gives every instant on the same schedule the same key", () => {
    const a = lastScheduledInstant(new Date("2026-06-01T08:01:00Z"), 1, 8);
    const b = lastScheduledInstant(new Date("2026-06-01T20:00:00Z"), 1, 8);
    expect(periodKeyFor(a)).toBe("2026-06-01T08");
    expect(periodKeyFor(b)).toBe(periodKeyFor(a));
    expect(periodKeyFor(lastScheduledInstant(new Date("2026-06-08T08:00:00Z"), 1, 8))).toBe("2026-06-08T08");
  });
});

describe("periodLabel", () => {
  it("shows the week in UTC with the year once", () => {
    expect(periodLabel(new Date("2026-05-25T08:00:00Z"), new Date("2026-06-01T08:00:00Z"))).toBe(
      "May 25 – Jun 1, 2026",
    );
  });
});

/** Alice (owner of ws-alice) with a link and some human clicks in the week before Monday 08:00. */
async function seedWeek(options: Parameters<typeof buildFixture>[0] = {}) {
  const f = buildFixture({ weeklyReportEnabled: true, ...options });
  f.clock.current = new Date("2026-06-01T08:05:00Z"); // five minutes after the scheduled time
  await f.userRepo.rows.push({
    id: "alice",
    email: "alice@example.com",
    name: "Alice",
    role: "user",
    banned: false,
  });
  const { link } = await f.links.create(
    users.alice,
    { destinationUrl: "https://a.example/", customCode: "promo" },
    { ip: null },
  );
  const click = (daysAgo: number, extra: Record<string, unknown> = {}) =>
    f.clickRepo.record({
      linkId: link.id,
      occurredAt: new Date(new Date("2026-06-01T08:00:00Z").getTime() - daysAgo * DAY),
      visitorHash: `v${Math.random()}`,
      country: "FR",
      region: null,
      city: null,
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      deviceType: "desktop",
      referrerHost: "news.example",
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

describe("ReportService.runWeekly", () => {
  it("emails each owner once with the week's numbers, and never twice for the same week", async () => {
    const { f, click } = await seedWeek();
    await click(1);
    await click(2);
    await click(3);
    await click(9); // the week before

    const summary = await f.reports.runWeekly();
    expect(summary).toContain("1 report emails sent");
    expect(f.mailer.sent).toHaveLength(1);
    const mail = defined(f.mailer.sent[0], "the report email");
    expect(mail.to).toBe("alice@example.com");
    expect(mail.subject).toContain("(3 clicks)");
    expect(mail.text).toContain("Clicks: 3 (+200% vs the week before: 1)");
    expect(mail.text).toContain("/promo: 3");
    expect(mail.text).toContain("news.example: 3");
    expect(mail.html).toContain("Top links");

    // A restart, a second instance, or the next scheduler tick: nothing more goes out.
    f.clock.advance(15 * 60_000);
    await f.reports.runWeekly();
    await f.reports.runWeekly();
    expect(f.mailer.sent).toHaveLength(1);
  });

  it("never resends an email that was sent, even long after the unfinished-claim timeout", async () => {
    const { f, click } = await seedWeek();
    await click(1);
    await f.reports.runWeekly();
    f.clock.advance(5 * HOUR); // far past the one-hour stale-claim window, still inside the send window
    await f.reports.runWeekly();
    expect(f.mailer.sent).toHaveLength(1);
  });

  it("sends again the following week", async () => {
    const { f, click } = await seedWeek();
    await click(1);
    await f.reports.runWeekly();
    f.clock.current = new Date("2026-06-08T08:05:00Z");
    await click(-3); // a click inside the new week
    await f.reports.runWeekly();
    expect(f.mailer.sent).toHaveLength(2);
  });

  it("leaves out bots, and skips a workspace with no human clicks in either week", async () => {
    const { f, click } = await seedWeek();
    await click(1, { isBot: true });
    await f.reports.runWeekly();
    expect(f.mailer.sent).toEqual([]);
  });

  it("only sends to owners and admins who have not opted out", async () => {
    const { f, click } = await seedWeek();
    await click(1);
    // Alice is the sole owner; add an admin, an editor and an opted-out admin.
    f.userRepo.rows.push(
      { id: "carol", email: "carol@example.com", name: "Carol", role: "user", banned: false },
      { id: "dave", email: "dave@example.com", name: "Dave", role: "user", banned: false },
      { id: "erin", email: "erin@example.com", name: "Erin", role: "user", banned: false },
    );
    for (const [userId, role] of [
      ["carol", "admin"],
      ["dave", "editor"],
      ["erin", "admin"],
    ] as const) {
      f.workspaceRepo.members.push({ workspaceId: "ws-alice", userId, role, joinedAt: new Date() });
    }
    await f.preferencesRepo.upsert("erin", { weeklyReport: false });

    await f.reports.runWeekly();
    expect(f.mailer.sent.map((m) => m.to).sort()).toEqual(["alice@example.com", "carol@example.com"]);
  });

  it("does nothing when the instance switch is off or mail is not configured", async () => {
    const off = await seedWeek({ weeklyReportEnabled: false });
    await off.click(1);
    expect(await off.f.reports.isEnabled()).toBe(false);

    const noMail = await seedWeek({ mailConfigured: false });
    await noMail.click(1);
    expect(await noMail.f.reports.isEnabled()).toBe(false);
  });

  it("does not catch up on a week that is more than a day old", async () => {
    const { f, click } = await seedWeek();
    await click(1);
    f.clock.current = new Date("2026-06-03T12:00:00Z"); // Wednesday: Monday's slot is 52 hours ago
    expect(await f.reports.runWeekly()).toBe("outside the send window");
    expect(f.mailer.sent).toEqual([]);
  });

  it("catches up after downtime within the window", async () => {
    const { f, click } = await seedWeek();
    await click(1);
    f.clock.current = new Date("2026-06-02T07:00:00Z"); // 23 hours after the slot
    await f.reports.runWeekly();
    expect(f.mailer.sent).toHaveLength(1);
  });

  it("follows a changed send day and hour", async () => {
    const { f, click } = await seedWeek();
    await click(1);
    await f.settings.update({ kind: "system" }, { reportSendDay: 3, reportSendHourUtc: 18 });
    f.clock.current = new Date("2026-06-01T08:05:00Z"); // Monday: not Wednesday's slot, last one was 5 days ago
    expect(await f.reports.runWeekly()).toBe("outside the send window");
  });

  it("releases the claim when sending fails so the next pass retries", async () => {
    const { f, click } = await seedWeek();
    await click(1);
    f.mailer.failNext = true;
    await f.reports.runWeekly();
    expect(f.mailer.sent).toEqual([]);
    f.clock.advance(15 * 60_000);
    await f.reports.runWeekly();
    expect(f.mailer.sent).toHaveLength(1);
  });

  it("a second instance racing the first cannot double-send", async () => {
    const { f, click } = await seedWeek();
    await click(1);
    await Promise.all([f.reports.runWeekly(), f.reports.runWeekly(), f.reports.runWeekly()]);
    expect(f.mailer.sent).toHaveLength(1);
  });

  it("keeps header-breaking characters out of the subject", async () => {
    const { f, click } = await seedWeek();
    await click(1);
    const ws = await f.workspaceRepo.findById("ws-alice");
    vi.spyOn(f.workspaceRepo, "findById").mockResolvedValue({
      ...defined(ws, "workspace"),
      name: "Evil\r\nBcc: x@y.z",
    });
    await f.reports.runWeekly();
    expect(f.mailer.sent[0]?.subject).not.toMatch(/[\r\n]/);
  });
});

describe("ReportService.runBrokenLinks", () => {
  it("lists flagged links once per week and only when the monitor is on", async () => {
    const f = buildFixture({
      weeklyReportEnabled: true,
      healthMonitorEnabled: true,
      healthFailureThreshold: 1,
    });
    f.clock.current = new Date("2026-06-01T08:05:00Z");
    f.userRepo.rows.push({
      id: "alice",
      email: "alice@example.com",
      name: "Alice",
      role: "user",
      banned: false,
    });
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://dead.example/", customCode: "dead" },
      { ip: null },
    );
    f.probe.fail("https://dead.example/", "not_found", 404);
    await f.healthMonitor.checkNow(users.alice, link.id);

    await f.reports.runBrokenLinks();
    await f.reports.runBrokenLinks();
    expect(f.mailer.sent).toHaveLength(1);
    expect(f.mailer.sent[0]?.subject).toBe("1 broken link in Personal");
    expect(f.mailer.sent[0]?.text).toContain("/dead");
    expect(f.mailer.sent[0]?.text).toContain("The page was not found");

    expect(await f.reports.isBrokenLinksEnabled()).toBe(true);
  });

  it("skips dismissed links, and respects the separate opt-out", async () => {
    const f = buildFixture({
      weeklyReportEnabled: true,
      healthMonitorEnabled: true,
      healthFailureThreshold: 1,
    });
    f.clock.current = new Date("2026-06-01T08:05:00Z");
    f.userRepo.rows.push({
      id: "alice",
      email: "alice@example.com",
      name: "Alice",
      role: "user",
      banned: false,
    });
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://dead.example/", customCode: "dead" },
      { ip: null },
    );
    f.probe.fail("https://dead.example/", "dns");
    await f.healthMonitor.checkNow(users.alice, link.id);

    await f.healthMonitor.dismiss(users.alice, link.id);
    await f.reports.runBrokenLinks();
    expect(f.mailer.sent).toEqual([]);

    defined(f.healthRepo.rows.get(link.id), "health record").dismissedAt = null;
    f.linkRepo.attentionIds.add(link.id);
    await f.preferencesRepo.upsert("alice", { brokenLinksEmail: false });
    await f.reports.runBrokenLinks();
    expect(f.mailer.sent).toEqual([]);
  });

  it("is off when the health monitor is off", async () => {
    const f = buildFixture({ weeklyReportEnabled: true, healthMonitorEnabled: false });
    expect(await f.reports.isBrokenLinksEnabled()).toBe(false);
  });
});

describe("preview and preferences", () => {
  it("sends the preview only to the person asking, without recording a delivery", async () => {
    const { f, click } = await seedWeek();
    await click(1);
    await f.reports.sendPreview(users.alice);
    expect(f.mailer.sent).toHaveLength(1);
    expect(f.mailer.sent[0]).toMatchObject({ to: "alice@example.com" });
    expect(f.mailer.sent[0]?.subject).toMatch(/^Preview:/);
    expect(f.deliveryRepo.rows.size).toBe(0);
  });

  it("refuses a preview without email and rate limits it", async () => {
    const none = await seedWeek({ mailConfigured: false });
    await expect(none.f.reports.sendPreview(users.alice)).rejects.toThrow(ValidationError);

    const { f } = await seedWeek();
    for (let i = 0; i < 5; i++) await f.reports.sendPreview(users.alice);
    await expect(f.reports.sendPreview(users.alice)).rejects.toThrow(RateLimitedError);
  });

  it("stores opt-outs per person and reports what the instance sends", async () => {
    const { f } = await seedWeek();
    expect((await f.reports.emailSettings(users.alice)).preferences).toMatchObject({
      weeklyReport: true,
      brokenLinksEmail: true,
    });
    await f.reports.setPreferences(users.alice, { weeklyReport: false });
    const after = await f.reports.emailSettings(users.alice);
    expect(after.preferences).toMatchObject({ weeklyReport: false, brokenLinksEmail: true });
    expect(after).toMatchObject({ reportsEnabled: true, brokenLinksEnabled: false, mailConfigured: true });
    await expect(f.reports.setPreferences({ kind: "anonymous", ip: null }, {})).rejects.toThrow();
  });
});

describe("FakeClock sanity", () => {
  it("is what the schedule maths run on", () => {
    expect(new FakeClock().now().toISOString()).toBe("2026-06-01T12:00:00.000Z");
  });
});
