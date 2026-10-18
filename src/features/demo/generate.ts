import type {
  AnalyticsDimension,
  Bucket,
  DeviceType,
  DimensionCount,
  HeatmapCell,
} from "@/server/domain/types";
import type { LinkAnalytics, RecentClick } from "@/server/services/analytics.service";
import { createRandom, hashSeed, sampleVisit, SCENARIOS, type ScenarioId } from "./scenarios";

export const DEMO_RANGES = ["24h", "7d", "30d", "90d"] as const;
export type DemoRange = (typeof DEMO_RANGES)[number];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const RANGE_MS: Record<DemoRange, number> = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
};
/** Enough history for the longest range plus its previous period. */
const HISTORY_DAYS = 181;

interface DemoClick {
  at: number;
  visitor: string;
  country: string;
  city: string;
  deviceType: DeviceType;
  browser: string;
  os: string;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  language: string;
  isBot: boolean;
}

function poisson(lambda: number, random: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) {
    // Normal approximation keeps big hours cheap.
    const u = 1 - random();
    const v = random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(0, Math.round(lambda + z * Math.sqrt(lambda)));
  }
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= random();
  } while (p > limit);
  return k - 1;
}

/** Synthetic click history for a scenario, ending at `now`. Stable for a given scenario and UTC day. */
export function generateDemoClicks(scenarioId: ScenarioId, now: Date): DemoClick[] {
  const scenario = SCENARIOS[scenarioId];
  const day = now.toISOString().slice(0, 10);
  const random = createRandom(hashSeed(`${scenarioId}:${day}`));
  const hourlyTotal = scenario.hourly.reduce((a, b) => a + b, 0);
  const weekdayMean = scenario.weekday.reduce((a, b) => a + b, 0) / 7;
  const nowMs = now.getTime();
  const currentHour = Math.floor(nowMs / HOUR_MS) * HOUR_MS;
  const start = currentHour - HISTORY_DAYS * DAY_MS;
  const clicks: DemoClick[] = [];

  for (let hourStart = start; hourStart <= currentHour; hourStart += HOUR_MS) {
    const date = new Date(hourStart);
    const weekday = date.getUTCDay();
    const daysAgo = Math.floor((currentHour - hourStart) / DAY_MS);
    const elapsed = hourStart === currentHour ? (nowMs - hourStart) / HOUR_MS : 1;
    const expected =
      scenario.dailyBase *
      scenario.shape(daysAgo, weekday) *
      ((scenario.weekday[weekday] ?? 1) / weekdayMean) *
      ((scenario.hourly[date.getUTCHours()] ?? 0) / hourlyTotal) *
      elapsed;
    const count = poisson(expected, random);
    // A small pool per day makes repeat visitors show up, like the daily-salted hash does.
    const pool = Math.max(1, Math.round(scenario.dailyBase * scenario.shape(daysAgo, weekday) * 0.8));
    for (let i = 0; i < count; i++) {
      const visit = sampleVisit(scenario, random);
      clicks.push({
        at: hourStart + Math.floor(random() * HOUR_MS * elapsed),
        visitor: `${daysAgo}:${Math.floor(random() * pool)}`,
        country: visit.country,
        city: visit.city,
        deviceType: visit.deviceType,
        browser: visit.browser,
        os: visit.os,
        referrerHost: visit.referrerHost,
        utmSource: visit.utm?.source ?? null,
        utmMedium: visit.utm?.medium ?? null,
        utmCampaign: visit.utm?.campaign ?? null,
        language: visit.language,
        isBot: visit.isBot,
      });
    }
  }
  return clicks.sort((a, b) => a.at - b.at);
}

const DIMENSION_FIELDS: Record<AnalyticsDimension, keyof DemoClick> = {
  country: "country",
  city: "city",
  device_type: "deviceType",
  browser: "browser",
  os: "os",
  referrer_host: "referrerHost",
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  language: "language",
};

function summarize(clicks: DemoClick[], includeBots: boolean) {
  const counted = includeBots ? clicks : clicks.filter((c) => !c.isBot);
  return {
    totalClicks: counted.length,
    uniqueVisitors: new Set(counted.map((c) => c.visitor)).size,
    botClicks: clicks.filter((c) => c.isBot).length,
  };
}

function topDimension(clicks: DemoClick[], dimension: AnalyticsDimension): DimensionCount[] {
  const field = DIMENSION_FIELDS[dimension];
  const counts = new Map<string, number>();
  for (const click of clicks) {
    const raw = click[field];
    const value = typeof raw === "string" && raw !== "" ? raw : "Unknown";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, clicks: count }))
    .sort((a, b) => b.clicks - a.clicks || a.value.localeCompare(b.value))
    .slice(0, 10);
}

/** Aggregate the synthetic history into the same shape the real analytics service returns. */
export function buildDemoAnalytics(
  scenarioId: ScenarioId,
  range: DemoRange,
  options: { now?: Date; includeBots?: boolean } = {},
): LinkAnalytics {
  const now = options.now ?? new Date();
  const includeBots = options.includeBots ?? false;
  const all = generateDemoClicks(scenarioId, now);
  const to = now.getTime();
  const span = RANGE_MS[range];
  const from = to - span;
  const bucket: Bucket = span <= 3 * DAY_MS ? "hour" : "day";

  const inRange = all.filter((c) => c.at >= from && c.at < to);
  const previousRange = all.filter((c) => c.at >= from - span && c.at < from);
  const counted = includeBots ? inRange : inRange.filter((c) => !c.isBot);

  const summary = summarize(inRange, includeBots);
  const previous = summarize(previousRange, includeBots);

  const step = bucket === "hour" ? HOUR_MS : DAY_MS;
  const floor = (t: number) => Math.floor(t / step) * step;
  const buckets = new Map<number, number>();
  const cells = new Map<string, HeatmapCell>();
  for (const click of counted) {
    buckets.set(floor(click.at), (buckets.get(floor(click.at)) ?? 0) + 1);
    const date = new Date(click.at);
    const key = `${date.getUTCDay()}:${date.getUTCHours()}`;
    const cell = cells.get(key) ?? { weekday: date.getUTCDay(), hour: date.getUTCHours(), clicks: 0 };
    cell.clicks++;
    cells.set(key, cell);
  }
  const timeseries: LinkAnalytics["timeseries"] = [];
  for (let t = floor(from); t < to; t += step) {
    timeseries.push({ bucket: new Date(t).toISOString(), clicks: buckets.get(t) ?? 0 });
  }

  const dimensions = Object.fromEntries(
    (Object.keys(DIMENSION_FIELDS) as AnalyticsDimension[]).map((d) => [d, topDimension(counted, d)]),
  ) as Record<AnalyticsDimension, DimensionCount[]>;

  const recent: RecentClick[] = counted
    .slice(-25)
    .reverse()
    .map((c) => ({
      occurredAt: new Date(c.at).toISOString(),
      country: c.country,
      city: c.city,
      browser: c.browser,
      os: c.os,
      deviceType: c.deviceType,
      referrerHost: c.referrerHost,
      isBot: c.isBot,
      language: c.language,
    }));

  return {
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), bucket },
    summary,
    previous,
    changePct:
      previous.totalClicks === 0
        ? null
        : Math.round(((summary.totalClicks - previous.totalClicks) / previous.totalClicks) * 1000) / 10,
    timeseries,
    heatmap: [...cells.values()],
    dimensions,
    recent,
  };
}

export function isDemoRange(value: unknown): value is DemoRange {
  return typeof value === "string" && (DEMO_RANGES as readonly string[]).includes(value);
}
