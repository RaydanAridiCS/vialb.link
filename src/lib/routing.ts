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

export interface RoutingRule {
  /** Match visitors on this platform. Omit to match any. */
  platform?: RoutingPlatform;
  /** Match visitors from these countries (ISO 3166-1 alpha-2, upper case). Omit to match any. */
  countries?: string[];
  url: string;
}

export interface Visitor {
  /** `null` when the device is unknown (bots, consoles, TVs, no User-Agent). */
  platform: RoutingPlatform | null;
  /** `null` when no geolocation is configured or the address is not in the database. */
  country: string | null;
}

export interface RouteMatch {
  rule: RoutingRule;
  index: number;
  /** Low-cardinality label stored with the click, e.g. `ios`, `country:FR`, `android+country:DE`. */
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
  return rule.platform !== undefined || (rule.countries?.length ?? 0) > 0;
}

/** A rule matches when every condition it sets is met; a rule with no conditions never matches. */
export function ruleMatches(rule: RoutingRule, visitor: Visitor): boolean {
  if (!hasCriteria(rule)) return false;
  if (rule.platform !== undefined && rule.platform !== visitor.platform) return false;
  if (rule.countries && rule.countries.length > 0) {
    if (visitor.country === null || !rule.countries.includes(visitor.country)) return false;
  }
  return true;
}

export function pickRoute(rules: readonly RoutingRule[], visitor: Visitor): RouteMatch | null {
  for (const [index, rule] of rules.entries()) {
    if (!ruleMatches(rule, visitor)) continue;
    const parts: string[] = [];
    if (rule.platform !== undefined) parts.push(rule.platform);
    if (rule.countries && rule.countries.length > 0 && visitor.country !== null) {
      parts.push(`country:${visitor.country}`);
    }
    return { rule, index, label: parts.join("+") };
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
    if (!hasCriteria(rule)) return { index, message: `Rule ${number}: choose a device, a country, or both` };
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

/** Why a set of rules cannot be saved, or `null`. */
export function routingProblem(rules: readonly RoutingRule[]): string | null {
  return routingIssue(rules)?.message ?? null;
}

/** "iPhone & iPad in US, CA" for lists and the tester. */
export function describeRule(rule: RoutingRule): string {
  const device = rule.platform ? ROUTING_PLATFORM_LABELS[rule.platform] : "Any device";
  const where = rule.countries && rule.countries.length > 0 ? ` in ${rule.countries.join(", ")}` : "";
  return `${device}${where}`;
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
      part.startsWith("country:")
        ? countryName(part.slice("country:".length))
        : isRoutingPlatform(part)
          ? ROUTING_PLATFORM_LABELS[part]
          : part,
    )
    .join(" · ");
}
