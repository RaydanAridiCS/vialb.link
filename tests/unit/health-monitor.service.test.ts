import { describe, expect, it, vi } from "vitest";
import { ForbiddenError, RateLimitedError, ValidationError } from "@/server/errors";
import { buildFixture, users } from "../support/fixtures";

const HOUR = 3_600_000;

async function seed(options: Parameters<typeof buildFixture>[0] = {}) {
  const f = buildFixture({ healthMonitorEnabled: true, ...options });
  const { link } = await f.links.create(
    users.alice,
    { destinationUrl: "https://a.example/page", customCode: "page1" },
    { ip: null },
  );
  return { f, link };
}

describe("HealthMonitorService.runDue", () => {
  it("checks links that were never checked and records a healthy state", async () => {
    const { f, link } = await seed();
    expect(await f.healthMonitor.runDue()).toContain("checked 1 links");
    expect(f.probe.calls).toEqual(["https://a.example/page"]);
    expect(f.healthRepo.rows.get(link.id)).toMatchObject({ state: "ok", consecutiveFailures: 0 });
  });

  it("does not look at a link again before it is due", async () => {
    const { f } = await seed();
    await f.healthMonitor.runDue();
    f.clock.advance(23 * HOUR);
    await f.healthMonitor.runDue();
    expect(f.probe.calls).toHaveLength(1);
    f.clock.advance(2 * HOUR);
    await f.healthMonitor.runDue();
    expect(f.probe.calls).toHaveLength(2);
  });

  it("flags only after N consecutive failures, retrying hourly meanwhile", async () => {
    const { f, link } = await seed();
    f.probe.fail("https://a.example/page", "not_found", 404);

    await f.healthMonitor.runDue();
    expect(f.healthRepo.rows.get(link.id)?.state).toBe("failing");
    f.clock.advance(HOUR + 1);
    await f.healthMonitor.runDue();
    expect(f.healthRepo.rows.get(link.id)?.state).toBe("failing");
    f.clock.advance(HOUR + 1);
    const summary = await f.healthMonitor.runDue();

    expect(summary).toContain("1 newly flagged");
    expect(f.healthRepo.rows.get(link.id)).toMatchObject({
      state: "flagged",
      lastReason: "not_found",
      lastStatusCode: 404,
      failingTarget: "https://a.example/page",
    });
    expect(f.linkRepo.attentionIds.has(link.id)).toBe(true);
  });

  it("a recovery in the middle resets the count", async () => {
    const { f, link } = await seed();
    f.probe.fail("https://a.example/page", "timeout");
    await f.healthMonitor.runDue();
    f.clock.advance(HOUR + 1);
    f.probe.heal("https://a.example/page");
    await f.healthMonitor.runDue();
    f.clock.advance(25 * HOUR);
    f.probe.fail("https://a.example/page", "timeout");
    await f.healthMonitor.runDue();
    expect(f.healthRepo.rows.get(link.id)).toMatchObject({ state: "failing", consecutiveFailures: 1 });
  });

  it("checks smart-routing targets too and names the one that failed", async () => {
    const f = buildFixture({ healthMonitorEnabled: true });
    const { link } = await f.links.create(
      users.alice,
      {
        destinationUrl: "https://a.example/page",
        routingRules: [{ platform: "ios", url: "https://apps.example/ios" }],
      },
      { ip: null },
    );
    f.probe.fail("https://apps.example/ios", "server_error", 503);
    await f.healthMonitor.runDue();
    expect(f.probe.calls).toEqual(["https://a.example/page", "https://apps.example/ios"]);
    expect(f.healthRepo.rows.get(link.id)).toMatchObject({
      failingTarget: "https://apps.example/ios",
      lastReason: "server_error",
    });
  });

  it("skips disabled, expired, password-protected, limit-reached, deleted and bio-button links", async () => {
    const f = buildFixture({ healthMonitorEnabled: true });
    const make = (code: string, extra: Record<string, unknown> = {}) =>
      f.links.create(
        users.alice,
        { destinationUrl: `https://${code}.example/`, customCode: code, ...extra },
        { ip: null },
      );
    await make("okay");
    const disabled = (await make("disabled")).link;
    await f.links.setEnabled(users.alice, [disabled.id], false);
    await make("expired", { expiration: { preset: "1h" } });
    await make("secret", { password: "hunter22" });
    await make("limited", { maxClicks: 1 });
    const removed = (await make("removed")).link;
    await f.links.delete(users.alice, [removed.id]);
    await f.linkRepo.create({
      code: "bio-btn",
      destinationUrl: "https://bio.example/",
      kind: "bio_button",
      workspaceId: "ws-alice",
    });
    for (const row of f.linkRepo.rows.values()) if (row.code === "limited") row.clickCount = 1;
    f.clock.advance(2 * HOUR);

    await f.healthMonitor.runDue();
    expect(f.probe.calls).toEqual(["https://okay.example/"]);
  });

  it("never lets one crashing check stop the others", async () => {
    const { f } = await seed();
    await f.links.create(
      users.alice,
      { destinationUrl: "https://b.example/", customCode: "page2" },
      { ip: null },
    );
    const original = f.probe.probe.bind(f.probe);
    f.probe.probe = vi.fn(async (url: string) => {
      if (url.includes("a.example")) throw new Error("kaboom");
      return original(url);
    });
    await expect(f.healthMonitor.runDue()).resolves.toContain("checked 2 links");
    expect(f.healthRepo.rows.size).toBe(1);
  });

  it("limits how many links one pass takes", async () => {
    const f = buildFixture({ healthMonitorEnabled: true, healthPacing: { batchSize: 2 } });
    for (let i = 0; i < 4; i++) {
      await f.links.create(users.alice, { destinationUrl: `https://h${i}.example/` }, { ip: null });
    }
    expect(await f.healthMonitor.runDue()).toContain("checked 2 links");
  });
});

describe("politeness", () => {
  it("keeps a gap between requests to the same host and runs different hosts together", async () => {
    const waits: number[] = [];
    const clockRef: { advance?: (ms: number) => void } = {};
    const f = buildFixture({
      healthMonitorEnabled: true,
      healthPacing: {
        hostGapMs: 1000,
        sleep: async (ms) => {
          waits.push(ms);
          clockRef.advance?.(ms);
        },
      },
    });
    clockRef.advance = (ms) => f.clock.advance(ms);
    await f.links.create(users.alice, { destinationUrl: "https://same.example/1" }, { ip: null });
    await f.links.create(users.alice, { destinationUrl: "https://same.example/2" }, { ip: null });
    await f.links.create(users.alice, { destinationUrl: "https://other.example/1" }, { ip: null });

    await f.healthMonitor.runDue();
    // Exactly one of the two same-host requests had to wait out the gap; the other host never did.
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(0);
    expect(waits[0]).toBeLessThanOrEqual(1000);
    expect(f.probe.calls).toHaveLength(3);
  });

  it("never has more requests in flight than the concurrency cap", async () => {
    const f = buildFixture({ healthMonitorEnabled: true, healthPacing: { concurrency: 3 } });
    for (let i = 0; i < 8; i++) {
      await f.links.create(users.alice, { destinationUrl: `https://host${i}.example/` }, { ip: null });
    }
    let inFlight = 0;
    let peak = 0;
    f.probe.probe = async (url: string) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return { ok: true, status: 200, reason: null, finalUrl: url };
    };
    await f.healthMonitor.runDue();
    expect(peak).toBe(3);
  });
});

describe("Safe Browsing", () => {
  it("flags an unsafe destination on the first check when a checker is configured", async () => {
    const check = vi.fn(async (url: string) => ({ safe: !url.includes("phish"), reason: "MALWARE" }));
    const f = buildFixture({ healthMonitorEnabled: true, safety: { isConfigured: true, check } });
    // Created while the checker approves, flagged later when the verdict changes.
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://ok.example/" },
      { ip: null },
    );
    const stored = f.linkRepo.rows.get(link.id);
    if (!stored) throw new Error("link missing");
    stored.destinationUrl = "https://phish.example/";
    await f.healthMonitor.runDue();
    expect(f.healthRepo.rows.get(link.id)).toMatchObject({ state: "flagged", lastReason: "unsafe" });
    expect(f.probe.calls).toEqual([]);
  });

  it("does not call a checker that is not configured", async () => {
    const { f } = await seed();
    await f.healthMonitor.runDue();
    // The default fixture checker is the no-op one; only the probe ran.
    expect(f.probe.calls).toHaveLength(1);
  });
});

describe("checkNow and dismiss", () => {
  it("a manual check counts like a scheduled one and can flag the link", async () => {
    const { f, link } = await seed({ healthFailureThreshold: 2 });
    f.probe.fail("https://a.example/page", "dns");
    const first = await f.healthMonitor.checkNow(users.alice, link.id);
    expect(first).toMatchObject({ state: "failing", needsAttention: false, reason: "dns" });
    const second = await f.healthMonitor.checkNow(users.alice, link.id);
    expect(second).toMatchObject({ state: "flagged", needsAttention: true });
  });

  it("refuses when the monitor is off, for other workspaces' links and for viewers", async () => {
    const off = await seed({ healthMonitorEnabled: false });
    await expect(off.f.healthMonitor.checkNow(users.alice, off.link.id)).rejects.toThrow(ValidationError);

    const { f, link } = await seed();
    await expect(f.healthMonitor.checkNow(users.bob, link.id)).rejects.toThrow(ForbiddenError);
    const viewer = { ...users.alice, workspace: { id: "ws-alice", role: "viewer" as const } };
    await expect(f.healthMonitor.checkNow(viewer, link.id)).rejects.toThrow(ForbiddenError);
  });

  it("explains why an ineligible link is not checked", async () => {
    const { f, link } = await seed();
    await f.links.setEnabled(users.alice, [link.id], false);
    await expect(f.healthMonitor.checkNow(users.alice, link.id)).rejects.toThrow(/Disabled/);
    await f.links.setEnabled(users.alice, [link.id], true);
    await f.links.update(users.alice, link.id, { password: "hunter22" });
    await expect(f.healthMonitor.checkNow(users.alice, link.id)).rejects.toThrow(/Password/);
  });

  it("rate limits the re-check button", async () => {
    const { f, link } = await seed();
    for (let i = 0; i < 20; i++) await f.healthMonitor.checkNow(users.alice, link.id);
    await expect(f.healthMonitor.checkNow(users.alice, link.id)).rejects.toThrow(RateLimitedError);
  });

  it("dismiss hides the flag from the list filter until the link fails again after recovering", async () => {
    const { f, link } = await seed({ healthFailureThreshold: 1 });
    f.probe.fail("https://a.example/page", "server_error", 500);
    await f.healthMonitor.checkNow(users.alice, link.id);
    const flagged = await f.links.list(users.alice, { health: "attention" });
    expect(flagged.items.map((l) => l.id)).toEqual([link.id]);
    expect(flagged.items[0]?.health).toMatchObject({ needsAttention: true, dismissed: false });

    await f.healthMonitor.dismiss(users.alice, link.id);
    expect((await f.links.list(users.alice, { health: "attention" })).items).toEqual([]);
    const all = await f.links.list(users.alice, {});
    expect(all.items[0]?.health).toMatchObject({ needsAttention: false, dismissed: true });

    f.probe.heal("https://a.example/page");
    await f.healthMonitor.checkNow(users.alice, link.id);
    f.probe.fail("https://a.example/page", "server_error", 500);
    await f.healthMonitor.checkNow(users.alice, link.id);
    expect((await f.links.list(users.alice, { health: "attention" })).items).toHaveLength(1);
  });

  it("editing the destination or routing wipes the record", async () => {
    const { f, link } = await seed({ healthFailureThreshold: 1 });
    f.probe.fail("https://a.example/page", "not_found", 404);
    await f.healthMonitor.checkNow(users.alice, link.id);
    expect(f.healthRepo.rows.has(link.id)).toBe(true);

    await f.links.update(users.alice, link.id, { title: "renamed" });
    expect(f.healthRepo.rows.has(link.id)).toBe(true);

    const updated = await f.links.update(users.alice, link.id, { destinationUrl: "https://fixed.example/" });
    expect(f.healthRepo.rows.has(link.id)).toBe(false);
    expect(updated.health).toBeNull();
    expect(f.linkRepo.attentionIds.has(link.id)).toBe(false);
  });
});
