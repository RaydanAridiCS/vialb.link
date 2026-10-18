import "server-only";
import { and, asc, count, desc, eq, gt, gte, lt, min, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { clicks } from "@/server/db/schema";
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
} from "@/server/domain/types";
import type { IClickRepository } from "@/server/repositories/click.repository";

/** Whitelisted dimension → column mapping; user input never reaches SQL identifiers. */
const DIMENSION_COLUMNS = {
  country: clicks.country,
  city: clicks.city,
  device_type: clicks.deviceType,
  browser: clicks.browser,
  os: clicks.os,
  referrer_host: clicks.referrerHost,
  utm_source: clicks.utmSource,
  utm_medium: clicks.utmMedium,
  utm_campaign: clicks.utmCampaign,
  language: clicks.language,
} as const satisfies Record<AnalyticsDimension, unknown>;

function rangeWhere(filter: ClickFilter, withBotFilter = true): SQL | undefined {
  return and(
    eq(clicks.linkId, filter.linkId),
    gte(clicks.occurredAt, filter.from),
    lt(clicks.occurredAt, filter.to),
    withBotFilter && !filter.includeBots ? eq(clicks.isBot, false) : undefined,
  );
}

export class DrizzleClickRepository implements IClickRepository {
  constructor(private readonly db: Database) {}

  async record(click: NewClick): Promise<void> {
    await this.db.insert(clicks).values(click);
  }

  async summary(filter: ClickFilter): Promise<AnalyticsSummary> {
    const counted = filter.includeBots ? sql`true` : sql`not ${clicks.isBot}`;
    const [row] = await this.db
      .select({
        totalClicks: sql<number>`count(*) filter (where ${counted})::int`,
        uniqueVisitors: sql<number>`count(distinct ${clicks.visitorHash}) filter (where ${counted})::int`,
        botClicks: sql<number>`count(*) filter (where ${clicks.isBot})::int`,
      })
      .from(clicks)
      .where(rangeWhere(filter, false));
    return {
      totalClicks: Number(row?.totalClicks ?? 0),
      uniqueVisitors: Number(row?.uniqueVisitors ?? 0),
      botClicks: Number(row?.botClicks ?? 0),
    };
  }

  async timeseries(filter: ClickFilter, bucket: Bucket): Promise<TimeseriesPoint[]> {
    // Buckets are computed on UTC wall-clock time so results do not depend on
    // the database session's TimeZone setting; generate_series zero-fills gaps.
    const unit = bucket === "hour" ? sql.raw("'hour'") : sql.raw("'day'");
    const step = bucket === "hour" ? sql.raw("interval '1 hour'") : sql.raw("interval '1 day'");
    const rows = await this.db.execute<{ bucket: Date | string; clicks: number }>(sql`
      with series as (
        select generate_series(
          date_trunc(${unit}, ${filter.from.toISOString()}::timestamptz at time zone 'UTC'),
          date_trunc(${unit}, (${filter.to.toISOString()}::timestamptz - interval '1 microsecond') at time zone 'UTC'),
          ${step}
        ) as bucket
      ), counts as (
        select date_trunc(${unit}, ${clicks.occurredAt} at time zone 'UTC') as bucket, count(*)::int as clicks
        from ${clicks}
        where ${rangeWhere(filter)}
        group by 1
      )
      select (s.bucket at time zone 'UTC') as bucket, coalesce(c.clicks, 0)::int as clicks
      from series s left join counts c on c.bucket = s.bucket
      order by s.bucket
    `);
    return [...rows].map((row) => ({ bucket: new Date(row.bucket), clicks: Number(row.clicks) }));
  }

  async heatmap(filter: ClickFilter): Promise<HeatmapCell[]> {
    const weekday = sql<number>`extract(dow from ${clicks.occurredAt} at time zone 'UTC')::int`;
    const hour = sql<number>`extract(hour from ${clicks.occurredAt} at time zone 'UTC')::int`;
    const rows = await this.db
      .select({ weekday, hour, clicks: sql<number>`count(*)::int` })
      .from(clicks)
      .where(rangeWhere(filter))
      .groupBy(weekday, hour);
    return rows.map((row) => ({
      weekday: Number(row.weekday),
      hour: Number(row.hour),
      clicks: Number(row.clicks),
    }));
  }

  async topDimension(
    filter: ClickFilter,
    dimension: AnalyticsDimension,
    limit: number,
  ): Promise<DimensionCount[]> {
    const column = DIMENSION_COLUMNS[dimension];
    const value = sql<string>`coalesce(nullif(${column}, ''), 'Unknown')`;
    const rows = await this.db
      .select({ value, clicks: sql<number>`count(*)::int` })
      .from(clicks)
      .where(rangeWhere(filter))
      .groupBy(value)
      .orderBy(sql`count(*) desc`, value)
      .limit(limit);
    return rows.map((row) => ({ value: row.value, clicks: Number(row.clicks) }));
  }

  async recent(filter: ClickFilter, limit: number): Promise<Click[]> {
    return this.db
      .select()
      .from(clicks)
      .where(rangeWhere(filter))
      .orderBy(desc(clicks.occurredAt), desc(clicks.id))
      .limit(limit) as Promise<Click[]>;
  }

  async *iterate(filter: ClickFilter, batchSize: number): AsyncIterable<Click[]> {
    let lastId = 0;
    for (;;) {
      const batch = (await this.db
        .select()
        .from(clicks)
        .where(and(rangeWhere(filter), gt(clicks.id, lastId)))
        .orderBy(asc(clicks.id))
        .limit(batchSize)) as Click[];
      if (batch.length === 0) return;
      yield batch;
      const last = batch.at(-1);
      if (!last || batch.length < batchSize) return;
      lastId = last.id;
    }
  }

  async count(since?: Date): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(clicks)
      .where(since ? gte(clicks.occurredAt, since) : undefined);
    return row?.total ?? 0;
  }

  async firstClickAt(linkId: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ first: min(clicks.occurredAt) })
      .from(clicks)
      .where(eq(clicks.linkId, linkId));
    return row?.first ?? null;
  }
}
