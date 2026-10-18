import "server-only";
import type { NextRequest } from "next/server";
import { RATE_LIMITS } from "@/lib/constants";
import { getContainer } from "@/server/container";
import { RateLimitedError, UnauthorizedError } from "@/server/errors";
import type { ApiPrincipal } from "@/server/services/api-key.service";
import { errorResponse } from "./error-mapper";

type RouteContext<P> = { params: Promise<P> };
type ApiHandler<P> = (request: NextRequest, principal: ApiPrincipal, params: P) => Promise<Response>;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Wraps a REST API route: Bearer API-key auth (no cookies, so no CSRF
 * surface), per-key rate limiting with X-RateLimit-* headers, and the shared
 * error shape `{ error: { code, message, details? } }`.
 */
export function withApiKey<P = Record<string, never>>(handler: ApiHandler<P>) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<Response> => {
    let rateHeaders: Record<string, string> = {};
    try {
      const header = request.headers.get("authorization") ?? "";
      const match = /^Bearer\s+(\S+)$/i.exec(header);
      if (!match?.[1]) throw new UnauthorizedError("Missing Bearer API key");

      const { apiKeys, limiter } = getContainer();
      const principal = await apiKeys.authenticate(match[1]);
      if (!principal) throw new UnauthorizedError("Invalid or revoked API key");

      const rule = RATE_LIMITS.apiKey;
      const result = await limiter.consume(`api:${principal.keyId}`, rule.limit, rule.windowMs);
      rateHeaders = {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      };
      if (!result.allowed) {
        throw new RateLimitedError(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)));
      }

      const response = await handler(request, principal, await context.params);
      for (const [key, value] of Object.entries({ ...NO_STORE, ...rateHeaders })) {
        if (!response.headers.has(key)) response.headers.set(key, value);
      }
      return response;
    } catch (error) {
      return errorResponse(error, { ...NO_STORE, ...rateHeaders });
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
