import { LIMITS } from "@/lib/constants";

/**
 * Smart routing: one short link, several destinations. Rules are checked in order and the first
 * match wins; a link without a matching rule goes to its normal destination. Pure, so the redirect
 * path, the server-side validation and the "test a visitor" box in the form all share one matcher.
 */

export const ROUTING_PLATFORMS = ["ios", "android", "desktop"] as const;
export type RoutingPlatform = (typeof ROUTING_PLATFORMS)[number];

export const ROUTING_PLATFORM_LABELS: Record<RoutingPlatform, string> = {
  ios: "iPhone & iPad",
  android: "Android",
  desktop: "Desktop",
};

/** One destination of an A/B or percentage split. */
export interface RoutingVariant {
  url: string;
  /** Whole percent, 1-100. The weights of a rule's variants add up to 100. */
  weight: number;
  /** Optional name shown next to the letter (A, B, …) in analytics. */
  label?: string;
}

export interface RoutingRule {
  /** Match visitors on this platform. Omit to match any. */
  platform?: RoutingPlatform;
  /** Match visitors from these countries (ISO 3166-1 alpha-2, upper case). Omit to match any. */
  countries?: string[];
  /** Where matching visitors go. With `variants`, the first variant's URL (the control). */
  url: string;
  /**
   * Splits matching visitors between 2-5 destinations by weight. A rule with variants may have no device or
   * country condition: it then applies to everyone, which is a plain A/B test.
   */
  variants?: RoutingVariant[];
}

/** Variants are named A, B, C… in the order they are listed. */
export const VARIANT_LETTERS = "ABCDE";

export interface Visitor {
  /** `null` when the device is unknown (bots, consoles, TVs, no User-Agent). */
  platform: RoutingPlatform | null;
  /** `null` when no geolocation is configured or the address is not in the database. */
  country: string | null;
  /**
   * A number from 0 to 99 for the rule at this index, used to choose between its variants. The caller decides how
   * it is derived (the redirect uses a daily-salted hash of the visitor, so it is stable for a day and testable);
   * without it every split sends visitors to its first variant.
   */
  bucket?: (ruleIndex: number) => number;
}

export interface RouteMatch {
  rule: RoutingRule;
  index: number;
  /** Where this visitor goes: the rule's URL, or the chosen variant's. */
  url: string;
  /** Index of the chosen variant when the rule splits traffic. */
  variant: number | null;
  /** Low-cardinality label stored with the click, e.g. `ios`, `country:FR`, `android+variant:B`, `variant:A`. */
  label: string;
}

export const COUNTRY_PATTERN = /^[A-Z]{2}$/;

export function isRoutingPlatform(value: string): value is RoutingPlatform {
  return (ROUTING_PLATFORMS as readonly string[]).includes(value);
}

/** Upper-cases, trims and removes duplicates, keeping the order people typed. */
export function normalizeCountries(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const code of raw) {
    const normalized = code.trim().toUpperCase();
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

export function hasCriteria(rule: RoutingRule): boolean {
  return rule.platform !== undefined || (rule.countries?.length ?? 0) > 0 || (rule.variants?.length ?? 0) > 0;
}

/**
 * A rule matches when every condition it sets is met; a rule with no conditions never matches. A rule that only
 * splits traffic has no conditions to meet and matches everyone.
 */
export function ruleMatches(rule: RoutingRule, visitor: Visitor): boolean {
  if (!hasCriteria(rule)) return false;
  if (rule.platform !== undefined && rule.platform !== visitor.platform) return false;
  if (rule.countries && rule.countries.length > 0) {
    if (visitor.country === null || !rule.countries.includes(visitor.country)) return false;
  }
  return true;
}

/**
 * Which variant a bucket (0-99) falls into: the weights are laid end to end, so with 70/30 buckets 0-69 are the
 * first variant and 70-99 the second. A bucket past the total (weights that do not add up) lands on the last one.
 */
export function pickVariant(variants: readonly { weight: number }[], bucket: number): number {
  let upTo = 0;
  for (const [index, variant] of variants.entries()) {
    upTo += variant.weight;
    if (bucket < upTo) return index;
  }
  return Math.max(variants.length - 1, 0);
}

export function pickRoute(rules: readonly RoutingRule[], visitor: Visitor): RouteMatch | null {
  for (const [index, rule] of rules.entries()) {
    if (!ruleMatches(rule, visitor)) continue;
    const parts: string[] = [];
    if (rule.platform !== undefined) parts.push(rule.platform);
    if (rule.countries && rule.countries.length > 0 && visitor.country !== null) {
      parts.push(`country:${visitor.country}`);
    }
    let url = rule.url;
    let variant: number | null = null;
    if (rule.variants && rule.variants.length > 0) {
      variant = pickVariant(rule.variants, visitor.bucket?.(index) ?? 0);
      url = rule.variants[variant]?.url ?? rule.url;
      parts.push(`variant:${VARIANT_LETTERS[variant] ?? "?"}`);
    }
    return { rule, index, url, variant, label: parts.join("+") };
  }
  return null;
}

/** Whether the visitor's country is needed at all, so links without country rules skip the lookup. */
export function needsGeo(rules: readonly RoutingRule[]): boolean {
  return rules.some((rule) => (rule.countries?.length ?? 0) > 0);
}

/** What is wrong with a set of rules, and which rule (0-based) is to blame; `null` index means the set as a whole. */
export interface RoutingIssue {
  index: number | null;
  message: string;
}

/** The first thing that stops a set of rules from being saved, or `null`. URLs are checked separately by the caller. */
export function routingIssue(rules: readonly RoutingRule[]): RoutingIssue | null {
  if (rules.length > LIMITS.routingRulesMax) {
    return { index: null, message: `A link can have at most ${LIMITS.routingRulesMax} routing rules` };
  }
  const seen = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    const number = index + 1;
    const variantProblem = variantsIssue(rule.variants);
    if (variantProblem) return { index, message: `Rule ${number}: ${variantProblem}` };
    if (!hasCriteria(rule)) {
      return { index, message: `Rule ${number}: choose a device, a country, both, or split the traffic` };
    }
    const countries = rule.countries ?? [];
    if (countries.length > LIMITS.routingCountriesMax) {
      return { index, message: `Rule ${number}: at most ${LIMITS.routingCountriesMax} countries` };
    }
    if (countries.some((code) => !COUNTRY_PATTERN.test(code))) {
      return { index, message: `Rule ${number}: countries are two-letter codes such as US or FR` };
    }
    const key = `${rule.platform ?? "*"}|${[...countries].sort().join(",")}`;
    if (seen.has(key)) {
      return {
        index,
        message: `Rule ${number} has the same conditions as an earlier rule, so it would never be used`,
      };
    }
    seen.add(key);
  }
  return null;
}

/** What is wrong with a rule's variants, or `null`. */
export function variantsIssue(variants: readonly RoutingVariant[] | undefined): string | null {
  if (variants === undefined) return null;
  if (variants.length < 2 || variants.length > LIMITS.routingVariantsMax) {
    return `a split needs between 2 and ${LIMITS.routingVariantsMax} destinations`;
  }
  if (variants.some((v) => !Number.isInteger(v.weight) || v.weight < 1 || v.weight > 100)) {
    return "each destination needs a whole-number share from 1 to 100";
  }
  const total = variants.reduce((sum, v) => sum + v.weight, 0);
  if (total !== 100) return `the shares add up to ${total}%, they must add up to 100%`;
  if ((variants ?? []).some((v) => (v.label ?? "").length > LIMITS.routingVariantLabelMax)) {
    return `names can be at most ${LIMITS.routingVariantLabelMax} characters`;
  }
  const urls = variants.map((v) => v.url.trim());
  if (new Set(urls).size !== urls.length) return "each destination must be different";
  return null;
}

/** Why a set of rules cannot be saved, or `null`. */
export function routingProblem(rules: readonly RoutingRule[]): string | null {
  return routingIssue(rules)?.message ?? null;
}

/** "iPhone & iPad in US, CA" for lists and the tester. */
export function describeRule(rule: RoutingRule): string {
  const device = rule.platform ? ROUTING_PLATFORM_LABELS[rule.platform] : "Any device";
  const where = rule.countries && rule.countries.length > 0 ? ` in ${rule.countries.join(", ")}` : "";
  const split = rule.variants ? ` · split ${rule.variants.map((v) => `${v.weight}%`).join(" / ")}` : "";
  const who = rule.variants && !rule.platform && !where ? "Everyone" : device;
  return `${who}${where}${split}`;
}

/**
 * Turns the label stored with a click (`ios`, `country:FR`, `android+country:DE`, `default`) into words
 * for the analytics page. `countryName` lets the caller localise country codes.
 */
export function describeRoute(label: string, countryName: (code: string) => string = (code) => code): string {
  if (label === "default") return "Default destination";
  return label
    .split("+")
    .map((part) =>
      part.startsWith("variant:")
        ? `Variant ${part.slice("variant:".length)}`
        : part.startsWith("country:")
          ? countryName(part.slice("country:".length))
          : isRoutingPlatform(part)
            ? ROUTING_PLATFORM_LABELS[part]
            : part,
    )
    .join(" · ");
}
