import { describe, expect, it } from "vitest";
import {
  applyOutcome,
  blankHealth,
  HISTORY_LIMIT,
  needsAttention,
  type HealthPolicy,
} from "@/server/lib/health-state";

const policy: HealthPolicy = { failureThreshold: 3, intervalMs: 24 * 3_600_000, retryMs: 3_600_000 };
const t0 = new Date("2026-06-01T12:00:00Z");
const at = (hours: number) => new Date(t0.getTime() + hours * 3_600_000);
const fail = { ok: false, reason: "not_found", status: 404, target: "https://a.example/x" } as const;
const pass = { ok: true, reason: null, status: 200, target: null } as const;

describe("applyOutcome", () => {
  it("stays quiet until the threshold of consecutive failures is reached", () => {
    let health = blankHealth("l1", t0);
    health = applyOutcome(health, fail, at(0), policy);
    expect(health).toMatchObject({ state: "failing", consecutiveFailures: 1, flaggedAt: null });
    health = applyOutcome(health, fail, at(1), policy);
    expect(health).toMatchObject({ state: "failing", consecutiveFailures: 2 });
    health = applyOutcome(health, fail, at(2), policy);
    expect(health).toMatchObject({ state: "flagged", consecutiveFailures: 3, flaggedAt: at(2) });
    expect(needsAttention(health)).toBe(true);
  });

  it("re-checks failing links soon and flagged ones on the normal interval", () => {
    const failing = applyOutcome(blankHealth("l1", t0), fail, at(0), policy);
    expect(failing.nextCheckAt).toEqual(at(1));
    const flagged = applyOutcome({ ...failing, consecutiveFailures: 2 }, fail, at(2), policy);
    expect(flagged.nextCheckAt).toEqual(at(2 + 24));
    const healthy = applyOutcome(failing, pass, at(1), policy);
    expect(healthy.nextCheckAt).toEqual(at(1 + 24));
  });

  it("a success resets the count and clears the flag and any dismissal", () => {
    let health = blankHealth("l1", t0);
    for (let i = 0; i < 3; i++) health = applyOutcome(health, fail, at(i), policy);
    health = { ...health, dismissedAt: at(3) };
    health = applyOutcome(health, pass, at(4), policy);
    expect(health).toMatchObject({
      state: "ok",
      consecutiveFailures: 0,
      flaggedAt: null,
      dismissedAt: null,
      lastReason: null,
      failingTarget: null,
    });
    expect(needsAttention(health)).toBe(false);
  });

  it("a failure in the middle does not count towards the threshold after a success", () => {
    let health = blankHealth("l1", t0);
    health = applyOutcome(health, fail, at(0), policy);
    health = applyOutcome(health, fail, at(1), policy);
    health = applyOutcome(health, pass, at(2), policy);
    health = applyOutcome(health, fail, at(3), policy);
    expect(health).toMatchObject({ state: "failing", consecutiveFailures: 1 });
  });

  it("keeps a dismissal while the link stays flagged, but a new flag shows again", () => {
    let health = blankHealth("l1", t0);
    for (let i = 0; i < 3; i++) health = applyOutcome(health, fail, at(i), policy);
    health = { ...health, dismissedAt: at(3) };
    health = applyOutcome(health, fail, at(30), policy);
    expect(health.state).toBe("flagged");
    expect(health.dismissedAt).toEqual(at(3));
    expect(needsAttention(health)).toBe(false);

    health = applyOutcome(health, pass, at(60), policy);
    for (let i = 0; i < 3; i++) health = applyOutcome(health, fail, at(61 + i), policy);
    expect(needsAttention(health)).toBe(true);
    expect(health.flaggedAt).toEqual(at(63));
  });

  it("an authoritative failure flags on the first check", () => {
    const health = applyOutcome(
      blankHealth("l1", t0),
      { ok: false, reason: "unsafe", status: null, target: "https://bad.example", immediate: true },
      t0,
      policy,
    );
    expect(health).toMatchObject({ state: "flagged", consecutiveFailures: 1, lastReason: "unsafe" });
  });

  it("records the reason, status code and failing target", () => {
    const health = applyOutcome(blankHealth("l1", t0), fail, t0, policy);
    expect(health).toMatchObject({
      lastReason: "not_found",
      lastStatusCode: 404,
      failingTarget: "https://a.example/x",
      lastCheckedAt: t0,
    });
  });

  it("keeps only the most recent entries of history", () => {
    let health = blankHealth("l1", t0);
    for (let i = 0; i < HISTORY_LIMIT + 7; i++) {
      health = applyOutcome(health, i % 2 === 0 ? pass : fail, at(i), policy);
    }
    expect(health.history).toHaveLength(HISTORY_LIMIT);
    expect(health.history.at(-1)?.at).toBe(at(HISTORY_LIMIT + 6).toISOString());
    expect(health.history[0]?.at).toBe(at(7).toISOString());
  });

  it("does not mutate the previous record", () => {
    const before = blankHealth("l1", t0);
    const snapshot = JSON.stringify(before);
    applyOutcome(before, fail, at(1), policy);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("needsAttention", () => {
  it("is false for missing, ok and failing records", () => {
    expect(needsAttention(null)).toBe(false);
    expect(needsAttention(undefined)).toBe(false);
    expect(needsAttention({ state: "ok", dismissedAt: null })).toBe(false);
    expect(needsAttention({ state: "failing", dismissedAt: null })).toBe(false);
  });
  it("is true only for flagged and not dismissed", () => {
    expect(needsAttention({ state: "flagged", dismissedAt: null })).toBe(true);
    expect(needsAttention({ state: "flagged", dismissedAt: t0 })).toBe(false);
  });
});
