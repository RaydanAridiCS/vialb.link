import "server-only";
import { env } from "@/lib/env";
import { enabledSocialProviders } from "@/server/auth/auth";
import { getContainer } from "@/server/container";

/** Date shown on the legal pages. Update it whenever their text changes. */
export const LEGAL_UPDATED_AT = "2026-10-26";

/**
 * Facts about how this instance is configured, so the legal pages only
 * describe services that are actually turned on.
 */
export async function getLegalFacts() {
  const { settings, mailer, abuse } = getContainer();
  const effective = await settings.get();
  return {
    anonymousLinks: effective.allowAnonymousLinks,
    pixels: effective.pixelsEnabled,
    anonLinkTtlHours: effective.anonLinkTtlHours,
    captcha: !!abuse.captchaSiteKey,
    safeBrowsing: !!env.SAFE_BROWSING_API_KEY,
    email: mailer.isConfigured,
    github: enabledSocialProviders.includes("github"),
    google: enabledSocialProviders.includes("google"),
    cdnGeo: env.TRUST_PROXY_GEO_HEADERS,
    localGeo: !!env.GEOLITE2_DB_PATH,
  };
}

export type LegalFacts = Awaited<ReturnType<typeof getLegalFacts>>;

/** "30 days" for whole days, otherwise "36 hours". */
export function formatLifetime(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
