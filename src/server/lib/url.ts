/** URL helpers shared by validation, abuse checks and the redirect path. */

export function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url;
  } catch {
    return null;
  }
}

/** Lower-case hostname without a trailing dot or `www.` prefix. */
export function normalizeHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

/** Normalises a blocklist entry (accepts bare domains or full URLs). */
export function normalizeDomainEntry(entry: string): string | null {
  const trimmed = entry.trim().toLowerCase();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const host = trimmed.includes("://") ? (parseHttpUrl(trimmed)?.hostname ?? null) : trimmed.split("/")[0];
  if (!host) return null;
  const normalized = normalizeHost(host.replace(/^\*\./, ""));
  return /^[a-z0-9.-]+$/.test(normalized) && normalized.includes(".") ? normalized : null;
}

/** True when `host` equals `domain` or is a subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = normalizeHost(host);
  const d = normalizeHost(domain);
  return h === d || h.endsWith(`.${d}`);
}

export function isBlockedHost(host: string, blocked: readonly string[]): boolean {
  return blocked.some((domain) => hostMatchesDomain(host, domain));
}
