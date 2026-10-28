import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { isForbiddenHostname, isPublicAddress } from "@/lib/ip-guard";
import type { ProbeFailureReason, ProbeResult, UrlProbe } from "@/server/ports/url-probe";

const MAX_REDIRECTS = 5;
const TOTAL_TIMEOUT_MS = 8000;

export interface TransportResponse {
  status: number;
  location: string | null;
}

/** One request, no redirect following, no body. Rejects with a {@link ProbeError}. */
export type Transport = (url: URL, method: "HEAD" | "GET", signal: AbortSignal) => Promise<TransportResponse>;

export class ProbeError extends Error {
  constructor(readonly reason: ProbeFailureReason) {
    super(reason);
  }
}

export interface HttpUrlProbeOptions {
  userAgent: string;
  /** Skips the public-address checks (intranet deployments, local tests). */
  allowPrivate?: boolean;
  timeoutMs?: number;
  maxRedirects?: number;
  transport?: Transport;
}

/**
 * Follows redirects by hand so every hop is validated again, tries HEAD first and falls back to GET
 * (many servers answer HEAD wrongly), and gives the whole chain one deadline. Safety lives in the
 * transport: addresses are checked at connect time, so a host that resolves differently a moment later
 * (DNS rebinding) still cannot reach a private network.
 */
export class HttpUrlProbe implements UrlProbe {
  private readonly transport: Transport;

  constructor(private readonly options: HttpUrlProbeOptions) {
    this.transport = options.transport ?? createNodeTransport(options);
  }

  async probe(startUrl: string): Promise<ProbeResult> {
    const signal = AbortSignal.timeout(this.options.timeoutMs ?? TOTAL_TIMEOUT_MS);
    const maxRedirects = this.options.maxRedirects ?? MAX_REDIRECTS;
    const visited = new Set<string>();
    let current = parseUrl(startUrl);
    if (!current) return failure("blocked_target", null, startUrl);

    for (let hop = 0; hop <= maxRedirects; hop++) {
      // Every hop is judged on its own, so a redirect cannot lead somewhere the first URL could not.
      if (!this.options.allowPrivate && isBlockedTarget(current)) {
        return failure("blocked_target", null, current.href);
      }
      const key = current.href;
      if (visited.has(key)) return failure("redirect_loop", null, key);
      visited.add(key);

      let response: TransportResponse;
      try {
        response = await this.request(current, signal);
      } catch (error) {
        return failure(error instanceof ProbeError ? error.reason : "network", null, key);
      }

      if (response.status >= 300 && response.status < 400 && response.location) {
        const next = parseUrl(response.location, current);
        if (!next) return failure("blocked_target", response.status, key);
        current = next;
        continue;
      }
      return classify(response.status, key);
    }
    return failure("too_many_redirects", null, current.href);
  }

  /** HEAD, then GET when HEAD fails in any way except the failures a GET cannot fix. */
  private async request(url: URL, signal: AbortSignal): Promise<TransportResponse> {
    try {
      const head = await this.transport(url, "HEAD", signal);
      if (head.status < 400) return head;
    } catch (error) {
      if (error instanceof ProbeError && ["blocked_target", "dns", "timeout", "tls"].includes(error.reason)) {
        throw error;
      }
    }
    return this.transport(url, "GET", signal);
  }
}

/** Names and IP literals that may never be contacted. Names that merely resolve badly are caught at connect time. */
export function isBlockedTarget(url: URL): boolean {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  return isForbiddenHostname(hostname) || (isIP(hostname) !== 0 && !isPublicAddress(hostname));
}

function parseUrl(value: string, base?: URL): URL | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function failure(reason: ProbeFailureReason, status: number | null, finalUrl: string): ProbeResult {
  return { ok: false, status, reason, finalUrl };
}

function classify(status: number, finalUrl: string): ProbeResult {
  if (status === 404 || status === 410) return failure("not_found", status, finalUrl);
  if (status >= 500) return failure("server_error", status, finalUrl);
  // 401, 403 and 429 are common answers to a bot even when the page works for people.
  return { ok: true, status, reason: null, finalUrl };
}

const TLS_CODES = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

export function mapNetworkError(error: unknown): ProbeFailureReason {
  if (error instanceof ProbeError) return error.reason;
  const { code = "", name = "" } = (error ?? {}) as { code?: string; name?: string };
  if (name === "AbortError" || name === "TimeoutError" || code === "ABORT_ERR" || code === "ETIMEDOUT") {
    return "timeout";
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EAI_NODATA") return "dns";
  if (code === "EBLOCKED") return "blocked_target";
  if (TLS_CODES.has(code) || code.startsWith("ERR_TLS") || code.startsWith("ERR_SSL")) return "tls";
  return "network";
}

type RequestLookup = NonNullable<http.RequestOptions["lookup"]>;

/**
 * A socket `lookup` that resolves every address and refuses the connection if any is not public.
 * Because it runs when the socket connects, it also covers hosts that change their answer between a
 * pre-check and the real connection.
 */
export const guardedLookup: RequestLookup = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 0);
      return;
    }
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((entry) => !isPublicAddress(entry.address))) {
      const blocked: NodeJS.ErrnoException = new Error(`${hostname} resolves to a non-public address`);
      blocked.code = "EBLOCKED";
      callback(blocked, "", 0);
      return;
    }
    if (options.all) {
      (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
      return;
    }
    const first = list[0];
    callback(null, first?.address ?? "", first?.family ?? 4);
  });
};

function createNodeTransport(options: HttpUrlProbeOptions): Transport {
  const allowPrivate = options.allowPrivate ?? false;
  return (url, method, signal) =>
    new Promise<TransportResponse>((resolve, reject) => {
      // IP literals skip DNS entirely, so they need their own check; names are checked at connect time.
      if (!allowPrivate && isBlockedTarget(url)) {
        reject(new ProbeError("blocked_target"));
        return;
      }
      const client = url.protocol === "https:" ? https : http;
      const request = client.request(
        url,
        {
          method,
          agent: false,
          signal,
          headers: { "user-agent": options.userAgent, accept: "*/*" },
          ...(allowPrivate ? {} : { lookup: guardedLookup }),
        },
        (response) => {
          const location = response.headers.location;
          // The body is never read: close the socket as soon as the status line is known.
          response.destroy();
          resolve({
            status: response.statusCode ?? 0,
            location: typeof location === "string" ? location : null,
          });
        },
      );
      request.on("error", (error) => reject(new ProbeError(mapNetworkError(error))));
      request.end();
    });
}
