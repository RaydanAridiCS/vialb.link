import type { HealthCheckEntry, HealthReason, LinkHealth } from "@/server/domain/types";

export const HISTORY_LIMIT = 10;

export interface HealthPolicy {
  /** Consecutive failed checks before a link is flagged. */
  failureThreshold: number;
  /** Gap between checks of a healthy (or flagged) link. */
  intervalMs: number;
  /** Gap between re-checks while a link is failing but not yet flagged. */
  retryMs: number;
}

export interface CheckOutcome {
  ok: boolean;
  reason: HealthReason | null;
  status: number | null;
  /** The URL that failed (destination or a routing target). */
  target: string | null;
  /** Authoritative failures (Safe Browsing) flag at once instead of waiting for the threshold. */
  immediate?: boolean;
}

function appendHistory(history: readonly HealthCheckEntry[], entry: HealthCheckEntry): HealthCheckEntry[] {
  return [...history, entry].slice(-HISTORY_LIMIT);
}

/** A link that has never failed. */
export function blankHealth(linkId: string, now: Date): LinkHealth {
  return {
    linkId,
    state: "ok",
    consecutiveFailures: 0,
    lastCheckedAt: null,
    nextCheckAt: now,
    lastReason: null,
    lastStatusCode: null,
    failingTarget: null,
    flaggedAt: null,
    dismissedAt: null,
    history: [],
  };
}

/** Pure state transition for one finished check. */
export function applyOutcome(
  previous: LinkHealth,
  outcome: CheckOutcome,
  now: Date,
  policy: HealthPolicy,
): LinkHealth {
  const entry: HealthCheckEntry = {
    at: now.toISOString(),
    ok: outcome.ok,
    reason: outcome.reason,
    status: outcome.status,
  };
  const history = appendHistory(previous.history, entry);

  if (outcome.ok) {
    return {
      ...previous,
      state: "ok",
      consecutiveFailures: 0,
      lastCheckedAt: now,
      nextCheckAt: new Date(now.getTime() + policy.intervalMs),
      lastReason: null,
      lastStatusCode: outcome.status,
      failingTarget: null,
      flaggedAt: null,
      dismissedAt: null,
      history,
    };
  }

  const consecutiveFailures = previous.consecutiveFailures + 1;
  const flagged = outcome.immediate === true || consecutiveFailures >= policy.failureThreshold;
  const newlyFlagged = flagged && previous.state !== "flagged";
  return {
    ...previous,
    state: flagged ? "flagged" : "failing",
    consecutiveFailures,
    lastCheckedAt: now,
    nextCheckAt: new Date(now.getTime() + (flagged ? policy.intervalMs : policy.retryMs)),
    lastReason: outcome.reason,
    lastStatusCode: outcome.status,
    failingTarget: outcome.target,
    flaggedAt: newlyFlagged ? now : previous.flaggedAt,
    // A fresh flag always shows, even if an earlier one was dismissed; staying flagged keeps the dismissal.
    dismissedAt: newlyFlagged ? null : previous.dismissedAt,
    history,
  };
}

/** Whether the dashboard should show "needs attention" for this record. */
export function needsAttention(
  health: Pick<LinkHealth, "state" | "dismissedAt"> | null | undefined,
): boolean {
  return health?.state === "flagged" && health.dismissedAt === null;
}
