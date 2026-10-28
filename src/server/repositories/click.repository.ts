import type {
  AnalyticsDimension,
  AnalyticsSummary,
  Bucket,
  Click,
  ClickFilter,
  DimensionCount,
  HeatmapCell,
  NewClick,
  TimeseriesPoint,
  WorkspaceReport,
} from "@/server/domain/types";

/** Click persistence + analytics. Every aggregation runs in SQL. */
export interface IClickRepository {
  record(click: NewClick): Promise<void>;
  summary(filter: ClickFilter): Promise<AnalyticsSummary>;
  /** Zero-filled series bucketed by hour or day (UTC). */
  timeseries(filter: ClickFilter, bucket: Bucket): Promise<TimeseriesPoint[]>;
  /**
   * Visitors per bucket, each counted once per bucket. Because the visitor hash rotates daily, a day bucket
   * is "unique per day"; an hour bucket only separates people within that hour.
   */
  uniqueTimeseries(filter: ClickFilter, bucket: Bucket): Promise<TimeseriesPoint[]>;
  /** Clicks for exactly these dimension values (used to compare a top list with the previous period). */
  dimensionCounts(
    filter: ClickFilter,
    dimension: AnalyticsDimension,
    values: readonly string[],
  ): Promise<DimensionCount[]>;
  heatmap(filter: ClickFilter): Promise<HeatmapCell[]>;
  topDimension(filter: ClickFilter, dimension: AnalyticsDimension, limit: number): Promise<DimensionCount[]>;
  recent(filter: ClickFilter, limit: number): Promise<Click[]>;
  /** Streams raw rows for CSV export in pages (keyset pagination on id). */
  iterate(filter: ClickFilter, batchSize: number): AsyncIterable<Click[]>;
  count(since?: Date): Promise<number>;
  firstClickAt(linkId: string): Promise<Date | null>;
  /**
   * The workspace's activity in `[from, to)` next to the equally long period before it, for the weekly
   * report. Top lists cover the current period only.
   */
  workspaceReport(workspaceId: string, from: Date, to: Date): Promise<WorkspaceReport>;
  /** Clicks (bots included) recorded before `cutoff`; what a retention setting would delete. */
  countOlderThan(cutoff: Date): Promise<number>;
  /** Deletes up to `limit` clicks recorded before `cutoff`, oldest first; returns how many went. */
  deleteOlderThan(cutoff: Date, limit: number): Promise<number>;
  /** Workspaces with at least one counted click in `[from, to)`. */
  activeWorkspaces(from: Date, to: Date): Promise<string[]>;
}
