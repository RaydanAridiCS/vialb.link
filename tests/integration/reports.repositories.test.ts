import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { DrizzleClickRepository } from "@/server/repositories/drizzle/click.repository.drizzle";
import { DrizzleEmailDeliveryRepository } from "@/server/repositories/drizzle/email-delivery.repository.drizzle";
import { DrizzleLinkHealthRepository } from "@/server/repositories/drizzle/link-health.repository.drizzle";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { DrizzleUserPreferencesRepository } from "@/server/repositories/drizzle/user-preferences.repository.drizzle";
import type { DeliveryKey } from "@/server/repositories/email-delivery.repository";
import { blankHealth } from "@/server/lib/health-state";
import { connect, createUser, personalWorkspace, truncateAll } from "./helpers";

const { db, close } = connect();
const links = new DrizzleLinkRepository(db);
const clicks = new DrizzleClickRepository(db);
const deliveries = new DrizzleEmailDeliveryRepository(db);
const preferences = new DrizzleUserPreferencesRepository(db);
const health = new DrizzleLinkHealthRepository(db);

afterAll(close);
beforeEach(() => truncateAll(db));

const DAY = 86_400_000;
const to = new Date("2026-06-01T08:00:00Z");
const from = new Date(to.getTime() - 7 * DAY);
const ago = (days: number) => new Date(to.getTime() - days * DAY);

async function owner(code: string) {
  const user = await createUser(db);
  const workspaceId = await personalWorkspace(db, user.id);
  const link = await links.create({
    code,
    destinationUrl: `https://${code}.example/`,
    userId: user.id,
    workspaceId,
  });
  return { user, workspaceId, link };
}

let hashSeq = 0;
function click(linkId: string, at: Date, extra: Partial<Parameters<typeof clicks.record>[0]> = {}) {
  hashSeq += 1;
  return clicks.record({
    linkId,
    occurredAt: at,
    visitorHash: `visitor-${hashSeq}`,
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
}

describe("workspaceReport", () => {
  it("counts this period against the one before and ranks the top lists", async () => {
    const { workspaceId, link } = await owner("big");
    const second = await links.create({ code: "small", destinationUrl: "https://s.example/", workspaceId });
    for (const d of [1, 2, 3, 4]) await click(link.id, ago(d));
    await click(link.id, ago(2), { country: "DE", referrerHost: "blog.example" });
    await click(link.id, ago(3), { country: "DE", referrerHost: "blog.example" });
    await click(second.id, ago(1), { referrerHost: null, country: null });
    for (const d of [8, 9]) await click(link.id, ago(d)); // previous period
    await click(second.id, ago(13));

    const report = await clicks.workspaceReport(workspaceId, from, to);
    expect(report).toMatchObject({ clicks: 7, previousClicks: 3, uniqueVisitors: 7 });
    expect(report.topLinks).toMatchObject([
      { code: "big", clicks: 6, previousClicks: 2 },
      { code: "small", clicks: 1, previousClicks: 1 },
    ]);
    expect(report.topReferrers).toEqual([
      { value: "news.example", clicks: 4 },
      { value: "blog.example", clicks: 2 },
      { value: "Unknown", clicks: 1 },
    ]);
    expect(report.topCountries).toEqual([
      { value: "FR", clicks: 4 },
      { value: "DE", clicks: 2 },
      { value: "Unknown", clicks: 1 },
    ]);
  });

  it("counts unique visitors by distinct hash and ignores bots, other workspaces, bio buttons and deleted links", async () => {
    const mine = await owner("mine");
    const theirs = await owner("theirs");
    const bio = await links.create({
      code: "bio-b",
      destinationUrl: "https://b.example/",
      workspaceId: mine.workspaceId,
      kind: "bio_button",
    });
    const removed = await links.create({
      code: "removed",
      destinationUrl: "https://r.example/",
      workspaceId: mine.workspaceId,
    });

    await click(mine.link.id, ago(1), { visitorHash: "same" });
    await click(mine.link.id, ago(1), { visitorHash: "same" });
    await click(mine.link.id, ago(1), { visitorHash: "other" });
    await click(mine.link.id, ago(1), { isBot: true });
    await click(theirs.link.id, ago(1));
    await click(bio.id, ago(1));
    await click(removed.id, ago(1));
    await links.softDelete([removed.id], to);

    const report = await clicks.workspaceReport(mine.workspaceId, from, to);
    expect(report).toMatchObject({ clicks: 3, uniqueVisitors: 2, previousClicks: 0 });
    expect(report.topLinks.map((l) => l.code)).toEqual(["mine"]);
  });

  it("treats the period as half-open: a click exactly at `to` belongs to the next one", async () => {
    const { workspaceId, link } = await owner("edge");
    await click(link.id, to);
    await click(link.id, from);
    await click(link.id, new Date(from.getTime() - 1));
    const report = await clicks.workspaceReport(workspaceId, from, to);
    expect(report).toMatchObject({ clicks: 1, previousClicks: 1 });
  });

  it("returns zeros for a workspace with no clicks", async () => {
    const { workspaceId } = await owner("quiet");
    expect(await clicks.workspaceReport(workspaceId, from, to)).toEqual({
      clicks: 0,
      previousClicks: 0,
      uniqueVisitors: 0,
      topLinks: [],
      topReferrers: [],
      topCountries: [],
    });
  });
});

describe("activeWorkspaces", () => {
  it("lists workspaces with a counted click in the window", async () => {
    const active = await owner("act");
    const botsOnly = await owner("bots");
    await owner("idle");
    await click(active.link.id, ago(1));
    await click(botsOnly.link.id, ago(1), { isBot: true });
    await click(active.link.id, ago(30));
    expect(await clicks.activeWorkspaces(from, to)).toEqual([active.workspaceId]);
    expect(await clicks.activeWorkspaces(ago(40), ago(20))).toEqual([active.workspaceId]);
    expect(await clicks.activeWorkspaces(ago(20), ago(10))).toEqual([]);
  });
});

describe("email_deliveries", () => {
  async function key(): Promise<DeliveryKey> {
    const { user, workspaceId } = await owner(`d${Math.random().toString(36).slice(2, 8)}`);
    return { kind: "weekly_report", workspaceId, userId: user.id, periodKey: "2026-06-01T08" };
  }
  const now = new Date("2026-06-01T08:05:00Z");
  const stale = (ms: number) => new Date(now.getTime() - ms);

  it("lets exactly one of many concurrent senders claim an email", async () => {
    const k = await key();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => deliveries.claim(k, now, stale(3_600_000))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("never lets anyone claim an email that was sent", async () => {
    const k = await key();
    expect(await deliveries.claim(k, now, stale(3_600_000))).toBe(true);
    await deliveries.markSent(k, now);
    const muchLater = new Date(now.getTime() + 30 * DAY);
    expect(await deliveries.claim(k, muchLater, new Date(muchLater.getTime() - 3_600_000))).toBe(false);
  });

  it("lets another sender take over an abandoned claim, but not a fresh one", async () => {
    const k = await key();
    expect(await deliveries.claim(k, now, stale(3_600_000))).toBe(true);
    const soon = new Date(now.getTime() + 10 * 60_000);
    expect(await deliveries.claim(k, soon, new Date(soon.getTime() - 3_600_000))).toBe(false);
    const later = new Date(now.getTime() + 2 * 3_600_000);
    expect(await deliveries.claim(k, later, new Date(later.getTime() - 3_600_000))).toBe(true);
  });

  it("release frees an unsent claim, and leaves a sent one alone", async () => {
    const a = await key();
    await deliveries.claim(a, now, stale(3_600_000));
    await deliveries.release(a);
    expect(await deliveries.claim(a, now, stale(3_600_000))).toBe(true);

    const b = await key();
    await deliveries.claim(b, now, stale(3_600_000));
    await deliveries.markSent(b, now);
    await deliveries.release(b);
    expect(await deliveries.claim(b, now, stale(3_600_000))).toBe(false);
  });

  it("treats other periods, kinds and people as separate emails", async () => {
    const k = await key();
    await deliveries.claim(k, now, stale(3_600_000));
    expect(await deliveries.claim({ ...k, periodKey: "2026-06-08T08" }, now, stale(3_600_000))).toBe(true);
    expect(await deliveries.claim({ ...k, kind: "broken_links" }, now, stale(3_600_000))).toBe(true);
  });

  it("disappears with the workspace", async () => {
    const k = await key();
    await deliveries.claim(k, now, stale(3_600_000));
    await db.delete(schema.workspaces);
    expect((await db.select().from(schema.emailDeliveries)).length).toBe(0);
  });
});

describe("user_preferences", () => {
  it("defaults everything on for people without a row, and stores changes", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    const before = await preferences.getMany([a.id, b.id]);
    expect(before.get(a.id)).toEqual({ userId: a.id, weeklyReport: true, brokenLinksEmail: true });

    expect(await preferences.upsert(a.id, { weeklyReport: false })).toEqual({
      userId: a.id,
      weeklyReport: false,
      brokenLinksEmail: true,
    });
    expect(await preferences.upsert(a.id, { brokenLinksEmail: false })).toMatchObject({
      weeklyReport: false,
      brokenLinksEmail: false,
    });
    const after = await preferences.getMany([a.id, b.id]);
    expect(after.get(a.id)).toMatchObject({ weeklyReport: false, brokenLinksEmail: false });
    expect(after.get(b.id)).toMatchObject({ weeklyReport: true, brokenLinksEmail: true });
    expect((await preferences.getMany([])).size).toBe(0);
  });
});

describe("workspaces with flagged links", () => {
  it("lists each workspace once", async () => {
    const a = await owner("fa");
    const a2 = await links.create({
      code: "fa2",
      destinationUrl: "https://x.example/",
      workspaceId: a.workspaceId,
    });
    const b = await owner("fb");
    const flagged = { state: "flagged" as const, flaggedAt: to };
    await health.save({ ...blankHealth(a.link.id, to), ...flagged });
    await health.save({ ...blankHealth(a2.id, to), ...flagged });
    await health.save({ ...blankHealth(b.link.id, to), ...flagged, dismissedAt: to });
    expect(await health.listWorkspacesWithFlagged()).toEqual([a.workspaceId]);
  });
});
