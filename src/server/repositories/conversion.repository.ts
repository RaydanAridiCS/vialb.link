import type { ClickFilter } from "@/server/domain/types";

/** The click behind a `vclid`, with what the conversion endpoint needs to decide whether to accept it. */
export interface ClickRefLookup {
  clickId: number;
  linkId: string;
  occurredAt: Date;
  isBot: boolean;
  conversionsEnabled: boolean;
}

export interface ConversionValueTotal {
  currency: string;
  totalMinor: number;
  /** Conversions that carried a value in this currency. */
  count: number;
}

export interface ConversionSummary {
  conversions: number;
  /** Counted clicks in the range that were given a click id (the denominator of the rate). */
  eligibleClicks: number;
  /** Per currency; currencies are never added together. */
  values: ConversionValueTotal[];
}

export interface ConversionBreakdownRow {
  value: string;
  /** Clicks with a click id. */
  clicks: number;
  conversions: number;
}

export type ConversionDimension = "routed_by" | "country" | "device_type";

export interface IConversionRepository {
  findClickByRef(ref: string): Promise<ClickRefLookup | null>;
  /** Stores the conversion. `false` when this click already has one (re-posts are harmless). */
  insert(input: {
    linkId: string;
    clickId: number;
    at: Date;
    valueMinor: number | null;
    currency: string | null;
  }): Promise<boolean>;
  /** Cohort by click time: conversions whose click falls in the range, against clicks in the range that got an id. */
  summary(filter: ClickFilter): Promise<ConversionSummary>;
  breakdown(
    filter: ClickFilter,
    dimension: ConversionDimension,
    limit: number,
  ): Promise<ConversionBreakdownRow[]>;
  /** Value and currency of the conversions among these clicks (for the CSV export). */
  forClicks(
    clickIds: readonly number[],
  ): Promise<Map<number, { valueMinor: number | null; currency: string | null }>>;
}
