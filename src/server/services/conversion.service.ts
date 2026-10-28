import { RATE_LIMITS } from "@/lib/constants";
import { isClickRef, normalizeCurrency, parseConversionValue } from "@/lib/conversions";
import type { Logger } from "@/lib/logger";
import { RateLimitedError, ValidationError } from "@/server/errors";
import type { Clock } from "@/server/ports/clock";
import type { RateLimiter } from "@/server/ports/rate-limiter";
import type { IConversionRepository } from "@/server/repositories/conversion.repository";

const DAY_MS = 86_400_000;

export interface ConversionInput {
  /** The `vclid` the destination received. */
  ref: unknown;
  /** Decimal amount in major units, e.g. "49.90". */
  value?: string | null;
  currency?: string | null;
  /** For rate limiting only; never stored. */
  ip: string | null;
}

/** What happened. All three are answered the same way to the caller, so a reference cannot be probed. */
export type ConversionOutcome = "recorded" | "duplicate" | "ignored";

export interface ConversionServiceDeps {
  conversions: IConversionRepository;
  limiter: RateLimiter;
  clock: Clock;
  logger: Logger;
  /** A conversion must arrive within this many days of its click. */
  windowDays: number;
}

/**
 * Takes conversion reports from destinations (server postbacks or the browser snippet). The click id is
 * the only credential, so everything else is about limiting what a leaked or guessed one can do: strict
 * formats checked before any lookup, one conversion per click, a time window, value and currency limits,
 * and rate limits per address and per link.
 */
export class ConversionService {
  constructor(private readonly deps: ConversionServiceDeps) {}

  async record(input: ConversionInput): Promise<ConversionOutcome> {
    await this.limit(`convert:ip:${input.ip ?? "unknown"}`, RATE_LIMITS.convertPerIp);

    // Format first: malformed input is the sender's mistake and says nothing about any real click.
    if (!isClickRef(input.ref)) throw new ValidationError("Invalid conversion id", { field: "cid" });
    const { valueMinor, currency } = this.parseAmount(input.value, input.currency);

    const click = await this.deps.conversions.findClickByRef(input.ref);
    const now = this.deps.clock.now();
    if (
      !click ||
      !click.conversionsEnabled ||
      click.isBot ||
      now.getTime() - click.occurredAt.getTime() > this.deps.windowDays * DAY_MS ||
      click.occurredAt.getTime() > now.getTime() + 60_000
    ) {
      return "ignored";
    }
    await this.limit(`convert:link:${click.linkId}`, RATE_LIMITS.convertPerLink);

    const created = await this.deps.conversions.insert({
      linkId: click.linkId,
      clickId: click.clickId,
      at: now,
      valueMinor,
      currency,
    });
    return created ? "recorded" : "duplicate";
  }

  private parseAmount(
    value: string | null | undefined,
    currency: string | null | undefined,
  ): { valueMinor: number | null; currency: string | null } {
    const hasValue = value !== undefined && value !== null && value !== "";
    const hasCurrency = currency !== undefined && currency !== null && currency !== "";
    if (!hasValue && !hasCurrency) return { valueMinor: null, currency: null };
    if (!hasValue || !hasCurrency) {
      throw new ValidationError("Send both value and currency, or neither", {
        field: hasValue ? "currency" : "value",
      });
    }
    const valueMinor = parseConversionValue(value);
    if (valueMinor === null) {
      throw new ValidationError("Value must be a non-negative amount with at most two decimals", {
        field: "value",
      });
    }
    const code = normalizeCurrency(currency);
    if (!code) throw new ValidationError("Unsupported currency", { field: "currency" });
    return { valueMinor, currency: code };
  }

  private async limit(key: string, rule: { limit: number; windowMs: number }) {
    const result = await this.deps.limiter.consume(key, rule.limit, rule.windowMs);
    if (!result.allowed) {
      throw new RateLimitedError(
        Math.max(1, Math.ceil((result.resetAt - this.deps.clock.now().getTime()) / 1000)),
      );
    }
  }
}
