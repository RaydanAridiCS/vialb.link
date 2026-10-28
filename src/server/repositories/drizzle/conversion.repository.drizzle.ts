import "server-only";
import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { clicks, conversions, links } from "@/server/db/schema";
import type { ClickFilter } from "@/server/domain/types";
import type {
  ClickRefLookup,
  ConversionBreakdownRow,
  ConversionDimension,
  ConversionSummary,
  IConversionRepository,
} from "@/server/repositories/conversion.repository";

const DIMENSION_COLUMNS = {
  routed_by: clicks.routedBy,
  country: clicks.country,
  device_type: clicks.deviceType,
} as const satisfies Record<ConversionDimension, unknown>;

/** Clicks in the range that carry a click id, bots left out unless asked for. */
function eligible(filter: ClickFilter) {
  return and(
    eq(clicks.linkId, filter.linkId),
    gte(clicks.occurredAt, filter.from),
    lt(clicks.occurredAt, filter.to),
    isNotNull(clicks.clickRef),
    filter.includeBots ? undefined : eq(clicks.isBot, false),
  );
}

export class DrizzleConversionRepository implements IConversionRepository {
  constructor(private readonly db: Database) {}

  async findClickByRef(ref: string): Promise<ClickRefLookup | null> {
    const [row] = await this.db
      .select({
        clickId: clicks.id,
        linkId: clicks.linkId,
        occurredAt: clicks.occurredAt,
        isBot: clicks.isBot,
        conversionsEnabled: links.conversionsEnabled,
      })
      .from(clicks)
      .innerJoin(links, eq(links.id, clicks.linkId))
      .where(eq(clicks.clickRef, ref))
      .limit(1);
    return row ?? null;
  }

  async insert(input: {
    linkId: string;
    clickId: number;
    at: Date;
    valueMinor: number | null;
    currency: string | null;
  }): Promise<boolean> {
    const inserted = await this.db
      .insert(conversions)
      .values({
        linkId: input.linkId,
        clickId: input.clickId,
        occurredAt: input.at,
        valueMinor: input.valueMinor,
        currency: input.currency,
      })
      .onConflictDoNothing({ target: conversions.clickId })
      .returning({ id: conversions.id });
    return inserted.length === 1;
  }

  async summary(filter: ClickFilter): Promise<ConversionSummary> {
    const [counts] = await this.db
      .select({
        eligibleClicks: sql<number>`count(${clicks.id})::int`,
        conversions: sql<number>`count(${conversions.id})::int`,
      })
      .from(clicks)
      .leftJoin(conversions, eq(conversions.clickId, clicks.id))
      .where(eligible(filter));
    const values = await this.db
      .select({
        currency: conversions.currency,
        totalMinor: sql<number>`coalesce(sum(${conversions.valueMinor}), 0)::bigint`,
        count: sql<number>`count(*)::int`,
      })
      .from(clicks)
      .innerJoin(conversions, eq(conversions.clickId, clicks.id))
      .where(and(eligible(filter), isNotNull(conversions.valueMinor), isNotNull(conversions.currency)))
      .groupBy(conversions.currency)
      .orderBy(conversions.currency);
    return {
      conversions: Number(counts?.conversions ?? 0),
      eligibleClicks: Number(counts?.eligibleClicks ?? 0),
      values: values.flatMap((row) =>
        row.currency
          ? [{ currency: row.currency, totalMinor: Number(row.totalMinor), count: Number(row.count) }]
          : [],
      ),
    };
  }

  async breakdown(
    filter: ClickFilter,
    dimension: ConversionDimension,
    limit: number,
  ): Promise<ConversionBreakdownRow[]> {
    const column = DIMENSION_COLUMNS[dimension];
    const value = sql<string>`coalesce(nullif(${column}, ''), 'Unknown')`;
    const rows = await this.db
      .select({
        value,
        clicks: sql<number>`count(${clicks.id})::int`,
        conversions: sql<number>`count(${conversions.id})::int`,
      })
      .from(clicks)
      .leftJoin(conversions, eq(conversions.clickId, clicks.id))
      .where(eligible(filter))
      .groupBy(value)
      .orderBy(sql`count(${clicks.id}) desc`, value)
      .limit(limit);
    return rows.map((row) => ({
      value: row.value,
      clicks: Number(row.clicks),
      conversions: Number(row.conversions),
    }));
  }

  async forClicks(
    clickIds: readonly number[],
  ): Promise<Map<number, { valueMinor: number | null; currency: string | null }>> {
    if (clickIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        clickId: conversions.clickId,
        valueMinor: conversions.valueMinor,
        currency: conversions.currency,
      })
      .from(conversions)
      .where(inArray(conversions.clickId, [...clickIds]));
    return new Map(rows.map((row) => [row.clickId, { valueMinor: row.valueMinor, currency: row.currency }]));
  }
}
