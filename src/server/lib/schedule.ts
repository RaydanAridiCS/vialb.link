const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The most recent moment at or before `now` that falls on `weekday` (0 = Sunday) at `hourUtc`:00. Weekly
 * jobs derive their period and their idempotency key from it, so every instance agrees on both.
 */
export function lastScheduledInstant(now: Date, weekday: number, hourUtc: number): Date {
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0),
  );
  let time = candidate.getTime();
  if (time > now.getTime()) time -= DAY_MS;
  const daysBack = (new Date(time).getUTCDay() - weekday + 7) % 7;
  return new Date(time - daysBack * DAY_MS);
}

/** `2026-06-01T08`: stable text for a scheduled instant (always on the hour). */
export function periodKeyFor(instant: Date): string {
  return instant.toISOString().slice(0, 13);
}
