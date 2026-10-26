/**
 * Retargeting pixels: a link can send visitors through a small page that loads an ad platform's tag
 * (after they agree) before forwarding them. Only the tag IDs are stored, never script text, and an ID
 * must match a strict pattern before it can reach the page.
 */

export interface LinkPixels {
  /** Meta (Facebook) Pixel ID: digits only. */
  meta?: string;
  /** Google tag ID: GA4 `G-…`, Google Ads `AW-…` or Tag Manager `GTM-…`. */
  google?: string;
}

export const META_PIXEL_PATTERN = /^\d{8,20}$/;
export const GOOGLE_TAG_PATTERN = /^(?:G|AW|GTM)-[A-Z0-9]{4,20}$/;

export function hasPixels(pixels: LinkPixels | null | undefined): pixels is LinkPixels {
  return !!pixels && (pixels.meta !== undefined || pixels.google !== undefined);
}

/** Trims, upper-cases Google IDs and drops empty entries; `null` when nothing is left. */
export function normalizePixels(raw: LinkPixels | null | undefined): LinkPixels | null {
  if (!raw) return null;
  const meta = raw.meta?.trim();
  const google = raw.google?.trim().toUpperCase();
  const out: LinkPixels = {
    ...(meta ? { meta } : {}),
    ...(google ? { google } : {}),
  };
  return hasPixels(out) ? out : null;
}

/** Why these pixels cannot be saved, or `null`. Expects normalized input. */
export function pixelsProblem(pixels: LinkPixels | null): string | null {
  if (!pixels) return null;
  if (pixels.meta !== undefined && !META_PIXEL_PATTERN.test(pixels.meta)) {
    return "A Meta Pixel ID is 8 to 20 digits";
  }
  if (pixels.google !== undefined && !GOOGLE_TAG_PATTERN.test(pixels.google)) {
    return "A Google tag ID looks like G-XXXXXXX, AW-XXXXXXX or GTM-XXXXXXX";
  }
  return null;
}

export const PIXEL_LABELS = { meta: "Meta Pixel", google: "Google tag" } as const;

/** First-party cookie remembering the visitor's choice on the pixel page. */
export const CONSENT_COOKIE = "vialb_consent";

export type PixelConsent = "granted" | "denied" | null;

/** The visitor's remembered choice from a `Cookie` header; anything unexpected counts as "not chosen". */
export function parseConsent(cookieHeader: string | null | undefined): PixelConsent {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === CONSENT_COOKIE) return value === "granted" || value === "denied" ? value : null;
  }
  return null;
}

/**
 * Visitors who signal "do not track me" (Global Privacy Control or Do Not Track) never see the page
 * and are sent straight on, whatever they chose before.
 */
export function optsOutOfTracking(headers: { get(name: string): string | null } | undefined): boolean {
  return headers?.get("sec-gpc") === "1" || headers?.get("dnt") === "1";
}
