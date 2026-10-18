import { ApiReference } from "@scalar/nextjs-api-reference";
import { APP_NAME } from "@/lib/constants";

/**
 * Interactive API reference (Scalar) rendered from /api/v1/openapi.json.
 * Scalar is loaded from jsDelivr, so this route carries its own CSP (it is
 * excluded from the proxy's nonce-based policy).
 */
export const GET = ApiReference(
  {
    url: "/api/v1/openapi.json",
    pageTitle: `${APP_NAME} API reference`,
    theme: "default",
    hideClientButton: false,
  },
  {
    headers: {
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
        "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "object-src 'none'",
      ].join("; "),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=300",
    },
  },
);
