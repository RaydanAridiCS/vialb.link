import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request CSP nonce + security headers (Next 16 "proxy", formerly
 * middleware). Reads process.env directly to stay lightweight; the same
 * variables are validated at startup by src/lib/env.ts.
 */
export function proxy(request: NextRequest) {
  // Bio pages live at /@handle (rewritten to /u/handle, see next.config.ts). Send the
  // internal path and the percent-encoded form to the canonical URL.
  const handle =
    /^\/u\/([A-Za-z0-9_]{1,50})\/?$/.exec(request.nextUrl.pathname)?.[1] ??
    /^\/%40([A-Za-z0-9_]{1,50})\/?$/.exec(request.nextUrl.pathname)?.[1];
  if (handle) return NextResponse.redirect(new URL(`/@${handle}`, process.env.SITE_URL ?? request.url), 308);

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const siteUrl = process.env.SITE_URL ?? "";
  const turnstile = process.env.TURNSTILE_SITE_KEY ? " https://challenges.cloudflare.com" : "";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by Radix/Recharts; scripts stay nonce-only.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${turnstile}`,
    `frame-src 'self'${turnstile}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(siteUrl.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!response.headers.has("Referrer-Policy")) {
    response.headers.set("Referrer-Policy", process.env.REFERRER_POLICY ?? "strict-origin-when-cross-origin");
  }
  const hstsMaxAge = Number(process.env.HSTS_MAX_AGE ?? 15552000);
  if (!isDev && siteUrl.startsWith("https://") && hstsMaxAge > 0) {
    response.headers.set("Strict-Transport-Security", `max-age=${hstsMaxAge}; includeSubDomains`);
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Skip static assets, the Scalar docs page (sets its own CSP) and prefetches.
      source: "/((?!_next/static|_next/image|favicon.ico|docs/api|api/health).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
