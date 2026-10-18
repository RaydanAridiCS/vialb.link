import { ZodError } from "zod";
import { logger } from "@/lib/logger";
import { isDomainError, RateLimitedError, type DomainErrorCode } from "@/server/errors";

/** The single mapping from domain errors to HTTP status codes. */
export const STATUS_BY_CODE: Record<DomainErrorCode | "INTERNAL_ERROR", number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export interface ApiErrorBody {
  error: { code: DomainErrorCode | "INTERNAL_ERROR"; message: string; details?: Record<string, unknown> };
}

export interface MappedError {
  status: number;
  body: ApiErrorBody;
  headers: Record<string, string>;
}

export function mapError(error: unknown): MappedError {
  if (error instanceof ZodError) {
    return {
      status: 400,
      headers: {},
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: { issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        },
      },
    };
  }
  if (isDomainError(error)) {
    const headers: Record<string, string> = {};
    if (error instanceof RateLimitedError) headers["Retry-After"] = String(error.retryAfterSeconds);
    return {
      status: STATUS_BY_CODE[error.code],
      headers,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }
  logger.error({ err: error }, "Unhandled error");
  return {
    status: 500,
    headers: {},
    body: { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
  };
}

export function errorResponse(error: unknown, extraHeaders: Record<string, string> = {}): Response {
  const mapped = mapError(error);
  return Response.json(mapped.body, {
    status: mapped.status,
    headers: { ...mapped.headers, ...extraHeaders },
  });
}

/** User-facing message for server actions (unexpected errors stay generic). */
export function actionErrorMessage(error: unknown): string {
  if (isDomainError(error)) return error.message;
  logger.error({ err: error }, "Server action failed");
  return "Something went wrong. Please try again.";
}
