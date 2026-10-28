/**
 * Conversion tracking helpers. Pure, so the redirect, the postback endpoint and the analytics screen agree on
 * the click id format, the accepted values and how rates are worked out.
 */

/** Query parameter added to a destination URL when the link tracks conversions. */
export const CLICK_REF_PARAM = "vclid";

/** Click ids are 12 random bytes in base64url: 16 characters. Checked before any database access. */
export const CLICK_REF_PATTERN = /^[A-Za-z0-9_-]{16}$/;

export function isClickRef(value: unknown): value is string {
  return typeof value === "string" && CLICK_REF_PATTERN.test(value);
}

/** Largest accepted amount, in major units (before the cents). */
export const MAX_CONVERSION_VALUE = 1_000_000_000;

/** Currencies a conversion may carry. A fixed list keeps garbage and typos out of the totals. */
export const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "NZD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "TRY",
  "JPY",
  "CNY",
  "HKD",
  "SGD",
  "KRW",
  "INR",
  "IDR",
  "THB",
  "MYR",
  "PHP",
  "VND",
  "BRL",
  "MXN",
  "ARS",
  "CLP",
  "COP",
  "ZAR",
  "AED",
  "SAR",
  "ILS",
  "EGP",
  "NGN",
  "KES",
  "UAH",
  "LBP",
] as const;

const CURRENCY_SET: ReadonlySet<string> = new Set(CURRENCIES);

/** Upper-cased currency code if it is on the list, otherwise `null`. */
export function normalizeCurrency(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return CURRENCY_SET.has(code) ? code : null;
}

/**
 * Parses an amount such as `49`, `49.9` or `49.90` into minor units (4990). Rejects negatives, exponents,
 * thousands separators, more than two decimals and anything above {@link MAX_CONVERSION_VALUE}.
 */
export function parseConversionValue(raw: string): number | null {
  const text = raw.trim();
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const major = Number(match[1]);
  if (major > MAX_CONVERSION_VALUE) return null;
  const minor = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const total = major * 100 + minor;
  return major === MAX_CONVERSION_VALUE && minor > 0 ? null : total;
}

/** Sets (replacing any existing) the `vclid` parameter on a destination URL; leaves other parts untouched. */
export function appendClickRef(destination: string, ref: string): string {
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return destination;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return destination;
  url.searchParams.set(CLICK_REF_PARAM, ref);
  return url.toString();
}

/** Conversion rate in percent with one decimal, or `null` when there were no eligible clicks. */
export function conversionRate(conversions: number, eligibleClicks: number): number | null {
  if (eligibleClicks <= 0) return null;
  return Math.round((conversions / eligibleClicks) * 1000) / 10;
}

/** `4990, "USD"` → "$49.90" (or the locale's form of it). */
export function formatMinor(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}
