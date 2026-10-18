import { isIP } from "node:net";

export interface ClientIpOptions {
  trustProxy: boolean;
  trustedHops: number;
}

function clean(candidate: string | undefined): string | null {
  if (!candidate) return null;
  let value = candidate.trim();
  // Strip IPv6 brackets/ports and IPv4 ports ("1.2.3.4:5678").
  if (value.startsWith("[")) value = value.slice(1, value.indexOf("]"));
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) value = value.split(":")[0] ?? value;
  if (value.startsWith("::ffff:") && isIP(value.slice(7)) === 4) value = value.slice(7);
  return isIP(value) ? value : null;
}

/**
 * Determines the client IP.
 *
 * - `TRUST_PROXY=true`: X-Forwarded-For is read from the right, skipping
 *   `TRUSTED_PROXY_HOPS - 1` entries, i.e. the address the outermost trusted
 *   proxy saw. Left-most entries are client-controlled and never trusted.
 * - `TRUST_PROXY=false`: the socket address. Next.js exposes it only by
 *   adding it as X-Forwarded-For when that header is absent, so the
 *   right-most entry is used. If the app is exposed directly to the
 *   internet a client can still spoof this; run it behind a proxy.
 */
export function getClientIp(headers: Headers, options: ClientIpOptions): string | null {
  const forwarded = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (forwarded.length === 0) return null;
  if (!options.trustProxy) return clean(forwarded.at(-1));
  const index = forwarded.length - options.trustedHops;
  return clean(forwarded[Math.max(0, index)]);
}

export interface ReferrerInfo {
  host: string | null;
  url: string | null;
}

export function parseReferrer(referrer: string | null): ReferrerInfo {
  if (!referrer) return { host: null, url: null };
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { host: null, url: null };
    // Drop query + fragment: they often carry personal data.
    return {
      host: url.hostname.replace(/^www\./, "").toLowerCase(),
      url: `${url.origin}${url.pathname}`.slice(0, 500),
    };
  } catch {
    return { host: null, url: null };
  }
}
