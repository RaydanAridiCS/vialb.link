import type { ClickFilter } from "@/server/domain/types";
import type {
  ClickRefLookup,
  ConversionBreakdownRow,
  ConversionDimension,
  ConversionSummary,
  IConversionRepository,
} from "@/server/repositories/conversion.repository";
import type { InMemoryClickRepository } from "./other.repositories.memory";
import type { InMemoryLinkRepository } from "./link.repository.memory";

interface Row {
  linkId: string;
  clickId: number;
  at: Date;
  valueMinor: number | null;
  currency: string | null;
}

const FIELDS = { routed_by: "routedBy", country: "country", device_type: "deviceType" } as const;

export class InMemoryConversionRepository implements IConversionRepository {
  readonly rows: Row[] = [];

  constructor(
    private readonly clickRepo: InMemoryClickRepository,
    private readonly linkRepo: InMemoryLinkRepository,
  ) {}

  /** Test helper: removes the clicks (and, like the foreign key, their conversions). */
  cascadeDeletedClicks() {
    const alive = new Set(this.clickRepo.rows.map((c) => c.id));
    for (let i = this.rows.length - 1; i >= 0; i--)
      if (!alive.has(this.rows[i]?.clickId as number)) this.rows.splice(i, 1);
  }

  async findClickByRef(ref: string): Promise<ClickRefLookup | null> {
    const click = this.clickRepo.rows.find((c) => c.clickRef === ref);
    if (!click) return null;
    const link = this.linkRepo.rows.get(click.linkId);
    if (!link) return null;
    return {
      clickId: click.id,
      linkId: click.linkId,
      occurredAt: click.occurredAt,
      isBot: click.isBot,
      conversionsEnabled: link.conversionsEnabled,
    };
  }

  async insert(input: Row & { at: Date }): Promise<boolean> {
    if (this.rows.some((r) => r.clickId === input.clickId)) return false;
    this.rows.push({ ...input });
    return true;
  }

  private eligible(filter: ClickFilter) {
    return this.clickRepo.rows.filter(
      (c) =>
        c.linkId === filter.linkId &&
        c.occurredAt >= filter.from &&
        c.occurredAt < filter.to &&
        c.clickRef != null &&
        (filter.includeBots || !c.isBot),
    );
  }

  async summary(filter: ClickFilter): Promise<ConversionSummary> {
    const clicks = this.eligible(filter);
    const ids = new Set(clicks.map((c) => c.id));
    const won = this.rows.filter((r) => ids.has(r.clickId));
    const totals = new Map<string, { totalMinor: number; count: number }>();
    for (const row of won) {
      if (row.valueMinor === null || row.currency === null) continue;
      const entry = totals.get(row.currency) ?? { totalMinor: 0, count: 0 };
      entry.totalMinor += row.valueMinor;
      entry.count++;
      totals.set(row.currency, entry);
    }
    return {
      conversions: won.length,
      eligibleClicks: clicks.length,
      values: [...totals.entries()]
        .map(([currency, v]) => ({ currency, ...v }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
    };
  }

  async breakdown(
    filter: ClickFilter,
    dimension: ConversionDimension,
    limit: number,
  ): Promise<ConversionBreakdownRow[]> {
    const converted = new Set(this.rows.map((r) => r.clickId));
    const groups = new Map<string, ConversionBreakdownRow>();
    for (const click of this.eligible(filter)) {
      const raw = click[FIELDS[dimension]];
      const value = typeof raw === "string" && raw !== "" ? raw : "Unknown";
      const row = groups.get(value) ?? { value, clicks: 0, conversions: 0 };
      row.clicks++;
      if (converted.has(click.id)) row.conversions++;
      groups.set(value, row);
    }
    return [...groups.values()]
      .sort((a, b) => b.clicks - a.clicks || a.value.localeCompare(b.value))
      .slice(0, limit);
  }

  async forClicks(clickIds: readonly number[]) {
    const wanted = new Set(clickIds);
    return new Map(
      this.rows
        .filter((r) => wanted.has(r.clickId))
        .map((r) => [r.clickId, { valueMinor: r.valueMinor, currency: r.currency }] as const),
    );
  }
}
