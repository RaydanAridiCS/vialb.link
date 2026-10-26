import { v7 as uuidv7 } from "uuid";
import type {
  AnalyticsDimension,
  AnalyticsSummary,
  ApiKey,
  Bucket,
  Click,
  ClickFilter,
  DimensionCount,
  HeatmapCell,
  InstanceSettingsOverride,
  NewClick,
  TimeseriesPoint,
  UserSummary,
} from "@/server/domain/types";
import { UniqueViolationError } from "@/server/errors";
import type { IApiKeyRepository } from "@/server/repositories/api-key.repository";
import type { IClickRepository } from "@/server/repositories/click.repository";
import type { ISettingsRepository } from "@/server/repositories/settings.repository";
import type { IUserRepository } from "@/server/repositories/user.repository";

const DIMENSION_FIELDS: Record<AnalyticsDimension, keyof NewClick> = {
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
  routed_by: "routedBy",
};

export class InMemoryClickRepository implements IClickRepository {
  readonly rows: Click[] = [];
  private nextId = 1;

  async record(click: NewClick): Promise<void> {
    this.rows.push({ ...click, id: this.nextId++, occurredAt: click.occurredAt ?? new Date() });
  }

  private inRange(filter: ClickFilter, withBots = filter.includeBots): Click[] {
    return this.rows.filter(
      (c) =>
        c.linkId === filter.linkId &&
        c.occurredAt >= filter.from &&
        c.occurredAt < filter.to &&
        (withBots || !c.isBot),
    );
  }

  async summary(filter: ClickFilter): Promise<AnalyticsSummary> {
    const counted = this.inRange(filter);
    return {
      totalClicks: counted.length,
      uniqueVisitors: new Set(counted.map((c) => c.visitorHash)).size,
      botClicks: this.inRange(filter, true).filter((c) => c.isBot).length,
    };
  }

  async timeseries(filter: ClickFilter, bucket: Bucket): Promise<TimeseriesPoint[]> {
    const step = bucket === "hour" ? 3_600_000 : 86_400_000;
    const floor = (d: Date) => Math.floor(d.getTime() / step) * step;
    const counts = new Map<number, number>();
    for (const c of this.inRange(filter))
      counts.set(floor(c.occurredAt), (counts.get(floor(c.occurredAt)) ?? 0) + 1);
    const points: TimeseriesPoint[] = [];
    for (let t = floor(filter.from); t < filter.to.getTime(); t += step) {
      points.push({ bucket: new Date(t), clicks: counts.get(t) ?? 0 });
    }
    return points;
  }

  async heatmap(filter: ClickFilter): Promise<HeatmapCell[]> {
    const cells = new Map<string, HeatmapCell>();
    for (const c of this.inRange(filter)) {
      const key = `${c.occurredAt.getUTCDay()}:${c.occurredAt.getUTCHours()}`;
      const cell = cells.get(key) ?? {
        weekday: c.occurredAt.getUTCDay(),
        hour: c.occurredAt.getUTCHours(),
        clicks: 0,
      };
      cell.clicks++;
      cells.set(key, cell);
    }
    return [...cells.values()];
  }

  async topDimension(
    filter: ClickFilter,
    dimension: AnalyticsDimension,
    limit: number,
  ): Promise<DimensionCount[]> {
    const field = DIMENSION_FIELDS[dimension];
    const counts = new Map<string, number>();
    for (const c of this.inRange(filter)) {
      const raw = c[field];
      const value = typeof raw === "string" && raw !== "" ? raw : "Unknown";
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, clicks]) => ({ value, clicks }))
      .sort((a, b) => b.clicks - a.clicks || a.value.localeCompare(b.value))
      .slice(0, limit);
  }

  async recent(filter: ClickFilter, limit: number): Promise<Click[]> {
    return this.inRange(filter)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit);
  }

  async *iterate(filter: ClickFilter, batchSize: number): AsyncIterable<Click[]> {
    const rows = this.inRange(filter);
    for (let i = 0; i < rows.length; i += batchSize) yield rows.slice(i, i + batchSize);
  }

  async count(since?: Date): Promise<number> {
    return since ? this.rows.filter((c) => c.occurredAt >= since).length : this.rows.length;
  }

  async firstClickAt(linkId: string): Promise<Date | null> {
    const times = this.rows.filter((c) => c.linkId === linkId).map((c) => c.occurredAt.getTime());
    return times.length ? new Date(Math.min(...times)) : null;
  }
}

export class InMemoryApiKeyRepository implements IApiKeyRepository {
  readonly rows: ApiKey[] = [];

  async create(input: Pick<ApiKey, "userId" | "name" | "prefix" | "hash">): Promise<ApiKey> {
    if (this.rows.some((k) => k.prefix === input.prefix))
      throw new UniqueViolationError("api_keys_prefix_unique");
    const key: ApiKey = { ...input, id: uuidv7(), lastUsedAt: null, createdAt: new Date(), revokedAt: null };
    this.rows.push(key);
    return { ...key };
  }

  async findActiveByPrefix(prefix: string): Promise<ApiKey | null> {
    return this.rows.find((k) => k.prefix === prefix && !k.revokedAt) ?? null;
  }

  async listByUser(userId: string): Promise<ApiKey[]> {
    return this.rows.filter((k) => k.userId === userId);
  }

  async revoke(id: string, userId: string, at: Date): Promise<boolean> {
    const key = this.rows.find((k) => k.id === id && k.userId === userId && !k.revokedAt);
    if (!key) return false;
    key.revokedAt = at;
    return true;
  }

  async touch(id: string, at: Date): Promise<void> {
    const key = this.rows.find((k) => k.id === id);
    if (key) key.lastUsedAt = at;
  }
}

export class InMemorySettingsRepository implements ISettingsRepository {
  current: InstanceSettingsOverride | null = null;
  readonly salts = new Map<string, string>();

  async get(): Promise<InstanceSettingsOverride | null> {
    return this.current ? { ...this.current } : null;
  }

  async upsert(patch: Partial<InstanceSettingsOverride>): Promise<InstanceSettingsOverride> {
    this.current = {
      allowAnonymousLinks: null,
      allowSignups: null,
      anonLinkTtlHours: null,
      blockedDomains: null,
      ...this.current,
      ...patch,
    };
    return { ...this.current };
  }

  async getOrCreateDailySalt(day: string, candidate: string): Promise<string> {
    if (!this.salts.has(day)) this.salts.set(day, candidate);
    return this.salts.get(day) ?? candidate;
  }
}

export class InMemoryUserRepository implements IUserRepository {
  readonly rows: UserSummary[] = [];

  async count(): Promise<number> {
    return this.rows.length;
  }

  async findByEmail(email: string): Promise<UserSummary | null> {
    return this.rows.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async findById(id: string): Promise<UserSummary | null> {
    return this.rows.find((u) => u.id === id) ?? null;
  }

  async findFirstAdmin(): Promise<UserSummary | null> {
    return this.rows.find((u) => u.role === "admin") ?? null;
  }
}
