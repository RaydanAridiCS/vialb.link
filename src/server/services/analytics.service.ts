import { LIMITS, RATE_LIMITS, type AnalyticsRange } from "@/lib/constants";
import type { Logger } from "@/lib/logger";
import type {
  Actor,
  AnalyticsDimension,
  AnalyticsSummary,
  Bucket,
  Click,
  ClickFilter,
  DimensionCount,
  HeatmapCell,
  TimeRange,
} from "@/server/domain/types";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { csvRow } from "@/server/lib/csv";
import { randomToken, utcDay, visitorHash } from "@/server/lib/hashing";
import { extractUtm } from "@/server/lib/query";
import { parseReferrer } from "@/server/lib/request";
import { parseUserAgent, primaryLanguage } from "@/server/lib/user-agent";
import type { Clock } from "@/server/ports/clock";
import type { GeoResolver } from "@/server/ports/geo-resolver";
import type { RateLimiter } from "@/server/ports/rate-limiter";
import { conversionRate } from "@/lib/conversions";
import type { IClickRepository } from "@/server/repositories/click.repository";
import type {
  ConversionBreakdownRow,
  ConversionValueTotal,
  IConversionRepository,
} from "@/server/repositories/conversion.repository";
import type { ISettingsRepository } from "@/server/repositories/settings.repository";
import type { LinkService } from "./link.service";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const RANGE_MS: Record<Exclude<AnalyticsRange, "all" | "custom">, number> = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
};
const MAX_CUSTOM_RANGE_MS = 2 * 366 * DAY_MS;

export interface AnalyticsQuery {
  range: AnalyticsRange;
  from?: Date;
  to?: Date;
  includeBots: boolean;
  /** Also load the previous period's series and breakdowns (the "compare" toggle). Default on. */
  compare?: boolean;
}

export interface ConversionRow extends ConversionBreakdownRow {
  /** Percent, one decimal; `null` without clicks. */
  rate: number | null;
}

/** Conversions for a link that tracks them. Cohort by click time: see docs/conversions.md. */
export interface ConversionAnalytics {
  conversions: number;
  /** Counted clicks in the range that were given a click id. */
  eligibleClicks: number;
  rate: number | null;
  /** Per currency; never added across currencies. */
  values: ConversionValueTotal[];
  previous: { conversions: number; eligibleClicks: number; rate: number | null } | null;
  /** By smart-routing label (including A/B variants), country and device. */
  byRoute: ConversionRow[];
  byCountry: ConversionRow[];
  byDevice: ConversionRow[];
}

export interface LinkAnalytics {
  range: { from: string; to: string; bucket: Bucket };
  summary: AnalyticsSummary;
  previous: AnalyticsSummary;
  /** % change of total clicks vs. the previous period of equal length (null when previous is 0). */
  changePct: number | null;
  timeseries: { bucket: string; clicks: number }[];
  /** Visitors per bucket, each counted once per bucket (per day for day buckets). */
  uniqueTimeseries?: { bucket: string; visitors: number }[];
  /** The previous period's clicks, bucket by bucket, aligned by position. Absent without comparison. */
  previousTimeseries?: { bucket: string; clicks: number }[];
  heatmap: HeatmapCell[];
  dimensions: Record<AnalyticsDimension, DimensionCount[]>;
  /** Previous-period clicks for exactly the values in `dimensions`. Absent without comparison. */
  previousDimensions?: Record<AnalyticsDimension, DimensionCount[]>;
  recent: RecentClick[];
  /** Present when the link tracks conversions. */
  conversions?: ConversionAnalytics;
}

export type RecentClick = Pick<
  Click,
  "country" | "city" | "browser" | "os" | "deviceType" | "referrerHost" | "isBot" | "language"
> & { occurredAt: string };

/** What the public stats page shows: totals and breakdowns only, nothing about individual visitors. */
export interface PublicLinkStats {
  label: string;
  code: string;
  range: { from: string; to: string };
  totalClicks: number;
  /** Counted once per UTC day, so a person who comes back on another day counts again. */
  uniqueVisitors: number;
  timeseries: { bucket: string; clicks: number }[];
  countries: DimensionCount[];
  referrers: DimensionCount[];
  devices: DimensionCount[];
  generatedAt: string;
}

const PUBLIC_STATS_DAYS = 30;
const STATS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export interface ClickRecordInput {
  linkId: string;
  ip: string | null;
  headers: Headers;
  searchParams: URLSearchParams;
  /** The smart-routing rule that picked the destination, if the link has rules. */
  routedBy?: string | null;
  /** The `vclid` handed to the destination (links that track conversions only). */
  clickRef?: string | null;
}

export interface AnalyticsServiceDeps {
  clicks: IClickRepository;
  links: LinkService;
  settingsRepo: ISettingsRepository;
  geo: GeoResolver;
  clock: Clock;
  logger: Logger;
  /** Limits how often one address can open public stats pages. */
  limiter?: RateLimiter;
  conversions: IConversionRepository;
}

const DIMENSIONS: AnalyticsDimension[] = [
  "country",
  "city",
  "device_type",
  "browser",
  "os",
  "referrer_host",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "language",
  "routed_by",
];

export class AnalyticsService {
  private readonly salts = new Map<string, Promise<string>>();

  constructor(private readonly deps: AnalyticsServiceDeps) {}

  /**
   * Records one click. Called from `after()` so it never delays the redirect;
   * every failure is logged and swallowed.
   */
  async recordClick(input: ClickRecordInput): Promise<void> {
    try {
      const now = this.deps.clock.now();
      const userAgent = input.headers.get("user-agent");
      const ua = parseUserAgent(userAgent);
      const [salt, geo] = await Promise.all([
        this.dailySalt(utcDay(now)),
        this.deps.geo.resolve({ ip: input.ip, headers: input.headers }),
      ]);
      const utm = extractUtm(input.searchParams);
      const referrer = parseReferrer(input.headers.get("referer"));
      await this.deps.clicks.record({
        linkId: input.linkId,
        occurredAt: now,
        visitorHash: visitorHash(input.ip, userAgent, salt),
        country: geo.country,
        region: geo.region,
        city: geo.city,
        browser: ua.browser,
        browserVersion: ua.browserVersion,
        os: ua.os,
        osVersion: ua.osVersion,
        deviceType: ua.deviceType,
        referrerHost: referrer.host,
        referrerUrl: referrer.url,
        utmSource: utm.utm_source,
        utmMedium: utm.utm_medium,
        utmCampaign: utm.utm_campaign,
        utmTerm: utm.utm_term,
        utmContent: utm.utm_content,
        language: primaryLanguage(input.headers.get("accept-language")),
        isBot: ua.isBot,
        routedBy: input.routedBy ?? null,
        clickRef: input.clickRef ?? null,
      });
    } catch (error) {
      this.deps.logger.warn({ err: error, linkId: input.linkId }, "Failed to record click");
    }
  }

  private dailySalt(day: string): Promise<string> {
    let salt = this.salts.get(day);
    if (!salt) {
      salt = this.deps.settingsRepo.getOrCreateDailySalt(day, randomToken(32));
      salt.catch(() => this.salts.delete(day));
      this.salts.clear(); // keep only the current day's salt in memory
      this.salts.set(day, salt);
    }
    return salt;
  }

  async resolveRange(
    query: AnalyticsQuery,
    linkId: string,
    linkCreatedAt: Date,
  ): Promise<TimeRange & { bucket: Bucket }> {
    const now = this.deps.clock.now();
    let from: Date;
    let to = now;
    switch (query.range) {
      case "all": {
        const first = await this.deps.clicks.firstClickAt(linkId);
        const start = first && first < linkCreatedAt ? first : linkCreatedAt;
        from = new Date(Math.min(start.getTime(), now.getTime() - DAY_MS));
        break;
      }
      case "custom": {
        if (!query.from || !query.to) throw new ValidationError("A custom range needs both from and to");
        from = query.from;
        to = query.to;
        if (from >= to) throw new ValidationError("The range start must be before its end");
        if (to.getTime() - from.getTime() > MAX_CUSTOM_RANGE_MS) {
          throw new ValidationError("Custom ranges can span at most two years");
        }
        break;
      }
      default:
        from = new Date(now.getTime() - RANGE_MS[query.range]);
    }
    const bucket: Bucket = to.getTime() - from.getTime() <= 3 * DAY_MS ? "hour" : "day";
    return { from, to, bucket };
  }

  async getLinkAnalytics(actor: Actor, linkId: string, query: AnalyticsQuery): Promise<LinkAnalytics> {
    const link = await this.deps.links.getOwned(actor, linkId, "link:read");
    const range = await this.resolveRange(query, link.id, link.createdAt);
    const filter: ClickFilter = {
      linkId: link.id,
      from: range.from,
      to: range.to,
      includeBots: query.includeBots,
    };
    const span = range.to.getTime() - range.from.getTime();
    const previousFilter: ClickFilter = {
      ...filter,
      from: new Date(range.from.getTime() - span),
      to: range.from,
    };

    const compare = query.compare !== false && query.range !== "all";
    const [summary, previous, timeseries, uniqueSeries, heatmap, recent, ...dimensionResults] =
      await Promise.all([
        this.deps.clicks.summary(filter),
        this.deps.clicks.summary(previousFilter),
        this.deps.clicks.timeseries(filter, range.bucket),
        this.deps.clicks.uniqueTimeseries(filter, range.bucket),
        this.deps.clicks.heatmap(filter),
        this.deps.clicks.recent(filter, 25),
        ...DIMENSIONS.map((d) => this.deps.clicks.topDimension(filter, d, 10)),
      ]);

    const dimensions = Object.fromEntries(DIMENSIONS.map((d, i) => [d, dimensionResults[i] ?? []])) as Record<
      AnalyticsDimension,
      DimensionCount[]
    >;

    let previousTimeseries: LinkAnalytics["previousTimeseries"];
    let previousDimensions: LinkAnalytics["previousDimensions"];
    if (compare) {
      const [previousSeries, previousCounts] = await Promise.all([
        this.deps.clicks.timeseries(previousFilter, range.bucket),
        Promise.all(
          DIMENSIONS.map((d) =>
            this.deps.clicks.dimensionCounts(
              previousFilter,
              d,
              dimensions[d].map((row) => row.value),
            ),
          ),
        ),
      ]);
      previousTimeseries = previousSeries.map((p) => ({ bucket: p.bucket.toISOString(), clicks: p.clicks }));
      previousDimensions = Object.fromEntries(
        DIMENSIONS.map((d, i) => [d, previousCounts[i] ?? []]),
      ) as Record<AnalyticsDimension, DimensionCount[]>;
    }

    const conversionStats = link.conversionsEnabled
      ? await this.conversionAnalytics(filter, compare ? previousFilter : null)
      : undefined;

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString(), bucket: range.bucket },
      summary,
      previous,
      changePct:
        previous.totalClicks === 0
          ? null
          : Math.round(((summary.totalClicks - previous.totalClicks) / previous.totalClicks) * 1000) / 10,
      timeseries: timeseries.map((p) => ({ bucket: p.bucket.toISOString(), clicks: p.clicks })),
      uniqueTimeseries: uniqueSeries.map((p) => ({ bucket: p.bucket.toISOString(), visitors: p.clicks })),
      previousTimeseries,
      heatmap,
      dimensions,
      previousDimensions,
      conversions: conversionStats,
      recent: recent.map((c) => ({
        occurredAt: c.occurredAt.toISOString(),
        country: c.country,
        city: c.city,
        browser: c.browser,
        os: c.os,
        deviceType: c.deviceType,
        referrerHost: c.referrerHost,
        isBot: c.isBot,
        language: c.language,
      })),
    };
  }

  private async conversionAnalytics(
    filter: ClickFilter,
    previousFilter: ClickFilter | null,
  ): Promise<ConversionAnalytics> {
    const { conversions } = this.deps;
    const [now, before, byRoute, byCountry, byDevice] = await Promise.all([
      conversions.summary(filter),
      previousFilter ? conversions.summary(previousFilter) : Promise.resolve(null),
      conversions.breakdown(filter, "routed_by", 10),
      conversions.breakdown(filter, "country", 10),
      conversions.breakdown(filter, "device_type", 6),
    ]);
    const withRate = (rows: ConversionBreakdownRow[]): ConversionRow[] =>
      rows.map((row) => ({ ...row, rate: conversionRate(row.conversions, row.clicks) }));
    return {
      conversions: now.conversions,
      eligibleClicks: now.eligibleClicks,
      rate: conversionRate(now.conversions, now.eligibleClicks),
      values: now.values,
      previous: before && {
        conversions: before.conversions,
        eligibleClicks: before.eligibleClicks,
        rate: conversionRate(before.conversions, before.eligibleClicks),
      },
      byRoute: withRate(byRoute),
      byCountry: withRate(byCountry),
      byDevice: withRate(byDevice),
    };
  }

  /**
   * The public, read-only stats of a link whose owner turned the page on. `null` for an unknown or revoked
   * token (the caller answers 404 either way). Bots are left out and no per-visitor data is returned.
   */
  async getPublicStats(token: string, ip: string | null): Promise<PublicLinkStats | null> {
    if (this.deps.limiter) {
      const rule = RATE_LIMITS.publicStats;
      const result = await this.deps.limiter.consume(
        `stats:ip:${ip ?? "unknown"}`,
        rule.limit,
        rule.windowMs,
      );
      if (!result.allowed) {
        throw new RateLimitedError(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)));
      }
    }
    if (!STATS_TOKEN_PATTERN.test(token)) return null;
    const link = await this.deps.links.findByStatsToken(token);
    if (!link) return null;

    // Whole UTC days (today included, so far), which keeps the first bar from being a half day.
    const to = this.deps.clock.now();
    const startOfToday = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    const from = new Date(startOfToday - (PUBLIC_STATS_DAYS - 1) * DAY_MS);
    const filter: ClickFilter = { linkId: link.id, from, to, includeBots: false };
    const [summary, timeseries, countries, referrers, devices] = await Promise.all([
      this.deps.clicks.summary(filter),
      this.deps.clicks.timeseries(filter, "day"),
      this.deps.clicks.topDimension(filter, "country", 10),
      this.deps.clicks.topDimension(filter, "referrer_host", 10),
      this.deps.clicks.topDimension(filter, "device_type", 6),
    ]);
    return {
      label: link.title ?? `/${link.code}`,
      code: link.code,
      range: { from: from.toISOString(), to: to.toISOString() },
      totalClicks: summary.totalClicks,
      uniqueVisitors: summary.uniqueVisitors,
      timeseries: timeseries.map((p) => ({ bucket: p.bucket.toISOString(), clicks: p.clicks })),
      countries,
      referrers,
      devices,
      generatedAt: to.toISOString(),
    };
  }

  /** Lightweight stats for the REST API. */
  async getLinkStats(actor: Actor, linkId: string, from?: Date, to?: Date) {
    const link = await this.deps.links.getOwned(actor, linkId, "link:read");
    const range = await this.resolveRange(
      from && to ? { range: "custom", from, to, includeBots: false } : { range: "30d", includeBots: false },
      link.id,
      link.createdAt,
    );
    const filter: ClickFilter = { linkId: link.id, from: range.from, to: range.to, includeBots: false };
    const [summary, timeseries, countries, referrers, conversionSummary] = await Promise.all([
      this.deps.clicks.summary(filter),
      this.deps.clicks.timeseries(filter, range.bucket),
      this.deps.clicks.topDimension(filter, "country", 10),
      this.deps.clicks.topDimension(filter, "referrer_host", 10),
      link.conversionsEnabled ? this.deps.conversions.summary(filter) : Promise.resolve(null),
    ]);
    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      bucket: range.bucket,
      ...summary,
      timeseries: timeseries.map((p) => ({ bucket: p.bucket.toISOString(), clicks: p.clicks })),
      countries,
      referrers,
      conversions: conversionSummary && {
        count: conversionSummary.conversions,
        eligibleClicks: conversionSummary.eligibleClicks,
        rate: conversionRate(conversionSummary.conversions, conversionSummary.eligibleClicks),
        values: conversionSummary.values,
      },
    };
  }

  /** CSV of raw clicks (no IPs exist to export), streamed in batches. */
  async exportClicksCsv(
    actor: Actor,
    linkId: string,
    query: AnalyticsQuery,
  ): Promise<ReadableStream<Uint8Array>> {
    const link = await this.deps.links.getOwned(actor, linkId, "link:read");
    const range = await this.resolveRange(query, link.id, link.createdAt);
    const filter: ClickFilter = {
      linkId: link.id,
      from: range.from,
      to: range.to,
      includeBots: query.includeBots,
    };
    const encoder = new TextEncoder();
    const iterator = this.deps.clicks.iterate(filter, 1000)[Symbol.asyncIterator]();
    let rows = 0;
    let headerSent = false;
    const header = [
      "occurred_at",
      "country",
      "region",
      "city",
      "browser",
      "browser_version",
      "os",
      "os_version",
      "device_type",
      "referrer_host",
      "referrer_url",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "language",
      "is_bot",
      "visitor_hash",
      "converted",
      "conversion_value",
      "conversion_currency",
    ];
    const trackConversions = link.conversionsEnabled;
    const conversionsRepo = this.deps.conversions;

    return new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        if (!headerSent) {
          headerSent = true;
          controller.enqueue(encoder.encode(csvRow(header)));
          return;
        }
        const next = await iterator.next();
        if (next.done || rows >= LIMITS.csvExportMaxRows) {
          controller.close();
          return;
        }
        rows += next.value.length;
        const won = trackConversions
          ? await conversionsRepo.forClicks(next.value.map((c) => c.id))
          : new Map<number, { valueMinor: number | null; currency: string | null }>();
        controller.enqueue(
          encoder.encode(
            next.value
              .map((c) =>
                csvRow([
                  c.occurredAt,
                  c.country,
                  c.region,
                  c.city,
                  c.browser,
                  c.browserVersion,
                  c.os,
                  c.osVersion,
                  c.deviceType,
                  c.referrerHost,
                  c.referrerUrl,
                  c.utmSource,
                  c.utmMedium,
                  c.utmCampaign,
                  c.utmTerm,
                  c.utmContent,
                  c.language,
                  c.isBot,
                  c.visitorHash,
                  trackConversions ? won.has(c.id) : "",
                  won.get(c.id)?.valueMinor == null ? "" : (won.get(c.id)?.valueMinor ?? 0) / 100,
                  won.get(c.id)?.currency ?? "",
                ]),
              )
              .join(""),
          ),
        );
      },
      cancel: async () => {
        await iterator.return?.();
      },
    });
  }
}
