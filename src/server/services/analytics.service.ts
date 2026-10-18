import { LIMITS, type AnalyticsRange } from "@/lib/constants";
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
import { ValidationError } from "@/server/errors";
import { csvRow } from "@/server/lib/csv";
import { randomToken, utcDay, visitorHash } from "@/server/lib/hashing";
import { extractUtm } from "@/server/lib/query";
import { parseReferrer } from "@/server/lib/request";
import { parseUserAgent, primaryLanguage } from "@/server/lib/user-agent";
import type { Clock } from "@/server/ports/clock";
import type { GeoResolver } from "@/server/ports/geo-resolver";
import type { IClickRepository } from "@/server/repositories/click.repository";
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
}

export interface LinkAnalytics {
  range: { from: string; to: string; bucket: Bucket };
  summary: AnalyticsSummary;
  previous: AnalyticsSummary;
  /** % change of total clicks vs. the previous period of equal length (null when previous is 0). */
  changePct: number | null;
  timeseries: { bucket: string; clicks: number }[];
  heatmap: HeatmapCell[];
  dimensions: Record<AnalyticsDimension, DimensionCount[]>;
  recent: RecentClick[];
}

export type RecentClick = Pick<
  Click,
  "country" | "city" | "browser" | "os" | "deviceType" | "referrerHost" | "isBot" | "language"
> & { occurredAt: string };

export interface ClickRecordInput {
  linkId: string;
  ip: string | null;
  headers: Headers;
  searchParams: URLSearchParams;
}

export interface AnalyticsServiceDeps {
  clicks: IClickRepository;
  links: LinkService;
  settingsRepo: ISettingsRepository;
  geo: GeoResolver;
  clock: Clock;
  logger: Logger;
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
    const link = await this.deps.links.getOwned(actor, linkId);
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

    const [summary, previous, timeseries, heatmap, recent, ...dimensionResults] = await Promise.all([
      this.deps.clicks.summary(filter),
      this.deps.clicks.summary(previousFilter),
      this.deps.clicks.timeseries(filter, range.bucket),
      this.deps.clicks.heatmap(filter),
      this.deps.clicks.recent(filter, 25),
      ...DIMENSIONS.map((d) => this.deps.clicks.topDimension(filter, d, 10)),
    ]);

    const dimensions = Object.fromEntries(DIMENSIONS.map((d, i) => [d, dimensionResults[i] ?? []])) as Record<
      AnalyticsDimension,
      DimensionCount[]
    >;

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString(), bucket: range.bucket },
      summary,
      previous,
      changePct:
        previous.totalClicks === 0
          ? null
          : Math.round(((summary.totalClicks - previous.totalClicks) / previous.totalClicks) * 1000) / 10,
      timeseries: timeseries.map((p) => ({ bucket: p.bucket.toISOString(), clicks: p.clicks })),
      heatmap,
      dimensions,
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

  /** Lightweight stats for the REST API. */
  async getLinkStats(actor: Actor, linkId: string, from?: Date, to?: Date) {
    const link = await this.deps.links.getOwned(actor, linkId);
    const range = await this.resolveRange(
      from && to ? { range: "custom", from, to, includeBots: false } : { range: "30d", includeBots: false },
      link.id,
      link.createdAt,
    );
    const filter: ClickFilter = { linkId: link.id, from: range.from, to: range.to, includeBots: false };
    const [summary, timeseries, countries, referrers] = await Promise.all([
      this.deps.clicks.summary(filter),
      this.deps.clicks.timeseries(filter, range.bucket),
      this.deps.clicks.topDimension(filter, "country", 10),
      this.deps.clicks.topDimension(filter, "referrer_host", 10),
    ]);
    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      bucket: range.bucket,
      ...summary,
      timeseries: timeseries.map((p) => ({ bucket: p.bucket.toISOString(), clicks: p.clicks })),
      countries,
      referrers,
    };
  }

  /** CSV of raw clicks (no IPs exist to export), streamed in batches. */
  async exportClicksCsv(
    actor: Actor,
    linkId: string,
    query: AnalyticsQuery,
  ): Promise<ReadableStream<Uint8Array>> {
    const link = await this.deps.links.getOwned(actor, linkId);
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
    ];

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
