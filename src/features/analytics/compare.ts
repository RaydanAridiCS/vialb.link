/** How a value moved against the previous period. Pure, shared by every delta shown in analytics. */
export interface Change {
  /** `current - previous`. */
  delta: number;
  /** Rounded percent change, or `null` when there was nothing before to compare with. */
  pct: number | null;
  /** More than nothing now, nothing before. */
  isNew: boolean;
}

export function compareValue(current: number, previous: number): Change {
  const delta = current - previous;
  if (previous === 0) return { delta, pct: null, isNew: current > 0 };
  return { delta, pct: Math.round((delta / previous) * 1000) / 10, isNew: false };
}

/** Previous-period clicks for one value of a breakdown (0 when it did not appear before). */
export function previousFor(
  previous: readonly { value: string; clicks: number }[] | undefined,
  value: string,
) {
  return previous?.find((row) => row.value === value)?.clicks ?? 0;
}

/**
 * Lines up two series by position so the previous period can be drawn under the current one. The previous
 * period has the same length, so index i of one corresponds to index i of the other.
 */
export function alignPrevious<T extends { bucket: string; clicks: number }>(
  current: readonly T[],
  previous: readonly { clicks: number }[] | undefined,
): (T & { previous?: number })[] {
  return current.map((point, i) =>
    previous ? { ...point, previous: previous[i]?.clicks ?? 0 } : { ...point },
  );
}
