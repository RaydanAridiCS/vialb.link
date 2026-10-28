import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { applyOutcome, blankHealth, type HealthPolicy } from "@/server/lib/health-state";
import { DrizzleJobRepository } from "@/server/repositories/drizzle/job.repository.drizzle";
import { DrizzleLinkHealthRepository } from "@/server/repositories/drizzle/link-health.repository.drizzle";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { connect, createUser, personalWorkspace, truncateAll } from "./helpers";

const { db, close } = connect();
const links = new DrizzleLinkRepository(db);
const health = new DrizzleLinkHealthRepository(db);
const jobs = new DrizzleJobRepository(db);

const policy: HealthPolicy = { failureThreshold: 2, intervalMs: 24 * 3_600_000, retryMs: 3_600_000 };
const now = new Date("2026-06-01T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

afterAll(close);
beforeEach(() => truncateAll(db));

async function makeLink(
  code: string,
  extra: Parameters<typeof links.create>[0] extends infer T ? Partial<T> : never = {},
) {
  const user = await createUser(db);
  const workspaceId = await personalWorkspace(db, user.id);
  return links.create({
    code,
    destinationUrl: `https://${code}.example/`,
    userId: user.id,
    workspaceId,
    ...extra,
  });
}

describe("job_runs claims", () => {
  it("lets exactly one of many concurrent claimers win", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => jobs.tryClaim("race", now, later(60_000))),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("holds the lease until it expires, then lets another claimer in", async () => {
    expect(await jobs.tryClaim("lease", now, later(60_000))).toBe(true);
    expect(await jobs.tryClaim("lease", later(30_000), later(90_000))).toBe(false);
    expect(await jobs.tryClaim("lease", later(61_000), later(120_000))).toBe(true);
  });

  it("is not due again until the next run time, and records the outcome", async () => {
    await jobs.tryClaim("sched", now, later(60_000));
    await jobs.finish("sched", {
      at: later(1000),
      nextRunAt: later(600_000),
      status: "ok",
      summary: "did stuff",
    });
    expect(await jobs.tryClaim("sched", later(300_000), later(360_000))).toBe(false);
    expect(await jobs.tryClaim("sched", later(300_000), later(360_000), { force: true })).toBe(true);
    await jobs.finish("sched", {
      at: later(310_000),
      nextRunAt: later(900_000),
      status: "error",
      error: "boom",
    });
    expect(await jobs.tryClaim("sched", later(700_000), later(760_000))).toBe(false);
    expect(await jobs.tryClaim("sched", later(900_000), later(960_000))).toBe(true);

    const [row] = await jobs.list();
    expect(row).toMatchObject({ name: "sched", lastStatus: "error", lastError: "boom", lastSummary: null });
  });
});

describe("link_health persistence", () => {
  it("round-trips a record, including its history, and replaces it on save", async () => {
    const link = await makeLink("rt");
    const first = applyOutcome(
      blankHealth(link.id, now),
      { ok: false, reason: "not_found", status: 404, target: link.destinationUrl },
      now,
      policy,
    );
    await health.save(first);
    expect(await health.find(link.id)).toEqual(first);

    const second = applyOutcome(
      first,
      { ok: false, reason: "dns", status: null, target: "x" },
      later(1),
      policy,
    );
    await health.save(second);
    const stored = await health.find(link.id);
    expect(stored).toMatchObject({ state: "flagged", consecutiveFailures: 2, lastReason: "dns" });
    expect(stored?.history).toHaveLength(2);
    expect(
      (await health.findMany([link.id, "00000000-0000-4000-8000-000000000000"])).map((h) => h.linkId),
    ).toEqual([link.id]);
    expect(await health.findMany([])).toEqual([]);
  });

  it("deletes with the link (cascade) and on request", async () => {
    const link = await makeLink("del");
    await health.save(blankHealth(link.id, now));
    await health.delete(link.id);
    expect(await health.find(link.id)).toBeNull();

    await health.save(blankHealth(link.id, now));
    await db.delete(schema.links).where(eq(schema.links.id, link.id));
    expect(await health.find(link.id)).toBeNull();
  });

  it("dismisses only flagged, undismissed records", async () => {
    const link = await makeLink("dis");
    expect(await health.dismiss(link.id, now)).toBe(false);
    await health.save({ ...blankHealth(link.id, now), state: "flagged", flaggedAt: now });
    expect(await health.dismiss(link.id, now)).toBe(true);
    expect(await health.dismiss(link.id, now)).toBe(false);
    expect((await health.find(link.id))?.dismissedAt).toEqual(now);
  });
});

describe("link_health due selection", () => {
  it("returns never-checked links and links past their next check, oldest first, within the limit", async () => {
    const fresh = await makeLink("fresh");
    const overdue = await makeLink("overdue");
    const notYet = await makeLink("notyet");
    await health.save({ ...blankHealth(overdue.id, now), nextCheckAt: later(-3_600_000) });
    await health.save({ ...blankHealth(notYet.id, now), nextCheckAt: later(3_600_000) });

    const due = await health.listDue(now, 10);
    expect(due.map((c) => c.linkId).sort()).toEqual([fresh.id, overdue.id].sort());
    expect(due.find((c) => c.linkId === overdue.id)?.health?.state).toBe("ok");
    expect(due.find((c) => c.linkId === fresh.id)?.health).toBeNull();
    expect(await health.listDue(now, 1)).toHaveLength(1);
  });

  it("carries the destination and the routing targets", async () => {
    const link = await makeLink("routed", {
      routingRules: [
        { platform: "ios", url: "https://apps.example/ios" },
        { countries: ["FR"], url: "https://fr.example/" },
      ],
    });
    const [candidate] = await health.listDue(now, 5);
    expect(candidate).toMatchObject({
      linkId: link.id,
      destinationUrl: "https://routed.example/",
      workspaceId: link.workspaceId,
    });
    expect(candidate?.extraTargets.sort()).toEqual(["https://apps.example/ios", "https://fr.example/"]);
  });

  it("skips disabled, deleted, expired, limit-reached, password-protected, bio-button and unowned links", async () => {
    const ok = await makeLink("ok");
    await makeLink("off", { isEnabled: false });
    const removed = await makeLink("removed");
    await links.softDelete([removed.id], now);
    await makeLink("expired", { expiresAt: later(-1000) });
    await makeLink("limited", { maxClicks: 2, clickCount: 2 });
    await makeLink("secret", { passwordHash: "x" });
    await makeLink("bio", { kind: "bio_button" });
    await links.create({ code: "anon", destinationUrl: "https://anon.example/" });
    const stillOpen = await makeLink("open", { maxClicks: 2, clickCount: 1, expiresAt: later(3_600_000) });

    const due = await health.listDue(now, 50);
    expect(due.map((c) => c.linkId).sort()).toEqual([ok.id, stillOpen.id].sort());
  });

  it("lists flagged, undismissed links of one workspace for the digest", async () => {
    const a = await makeLink("fa");
    const b = await makeLink("fb");
    const c = await makeLink("fc");
    const flagged = {
      ...blankHealth("", now),
      state: "flagged" as const,
      flaggedAt: now,
      lastReason: "not_found" as const,
    };
    await health.save({ ...flagged, linkId: a.id });
    await health.save({ ...flagged, linkId: b.id, dismissedAt: now });
    await health.save({ ...blankHealth(c.id, now), state: "failing" });

    const forA = await health.listFlaggedByWorkspace(a.workspaceId as string, 10);
    expect(forA).toMatchObject([{ linkId: a.id, code: "fa", reason: "not_found" }]);
    expect(await health.listFlaggedByWorkspace(b.workspaceId as string, 10)).toEqual([]);
  });
});

describe("list filter: health=attention", () => {
  it("returns only flagged, undismissed links", async () => {
    const flagged = await makeLink("hot");
    const dismissed = await makeLink("ignored");
    const fine = await makeLink("fine");
    await health.save({ ...blankHealth(flagged.id, now), state: "flagged", flaggedAt: now });
    await health.save({
      ...blankHealth(dismissed.id, now),
      state: "flagged",
      flaggedAt: now,
      dismissedAt: now,
    });
    await health.save(blankHealth(fine.id, now));

    const page = await links.list({ health: "attention", page: 1, pageSize: 20, now });
    expect(page.items.map((l) => l.code)).toEqual(["hot"]);
    expect(page.total).toBe(1);
    const all = await links.list({ page: 1, pageSize: 20, now });
    expect(all.total).toBe(3);
  });
});
