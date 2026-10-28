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
  /** Workspaces with at least one counted click in `[from, to)`. */
  activeWorkspaces(from: Date, to: Date): Promise<string[]>;
}
