export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmValues = Record<UtmKey, string>;

export const UTM_PRESETS = [
  { id: "instagram", label: "Instagram bio", values: { utm_source: "instagram", utm_medium: "social_bio" } },
  { id: "tiktok", label: "TikTok", values: { utm_source: "tiktok", utm_medium: "video_bio" } },
  { id: "newsletter", label: "Email newsletter", values: { utm_source: "newsletter", utm_medium: "email" } },
  { id: "print", label: "Printed flyer", values: { utm_source: "print", utm_medium: "qr_code" } },
] as const satisfies readonly { id: string; label: string; values: Partial<UtmValues> }[];

export function emptyUtm(): UtmValues {
  return { utm_source: "", utm_medium: "", utm_campaign: "", utm_term: "", utm_content: "" };
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** UTM parameters already present on a URL (empty values when the URL is invalid). */
export function readUtm(url: string): UtmValues {
  const values = emptyUtm();
  const parsed = parse(url);
  if (!parsed) return values;
  for (const key of UTM_KEYS) values[key] = parsed.searchParams.get(key) ?? "";
  return values;
}

/**
 * Returns `url` with the given UTM values applied. Blank values remove the parameter;
 * all other query parameters and the hash are left untouched. Invalid URLs are returned as-is.
 */
export function applyUtm(url: string, values: Partial<UtmValues>): string {
  const parsed = parse(url);
  if (!parsed) return url;
  for (const key of UTM_KEYS) {
    const value = values[key]?.trim();
    if (value) parsed.searchParams.set(key, value);
    else parsed.searchParams.delete(key);
  }
  return parsed.toString();
}
