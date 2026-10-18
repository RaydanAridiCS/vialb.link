/**
 * Typed domain errors. Services throw these; `server/http/error-mapper.ts`
 * is the single place that turns them into HTTP status codes / API payloads.
 *
 * Next.js can bundle this module into more than one server chunk (e.g. the
 * RSC and SSR layers), which would break plain `instanceof` checks between
 * copies. Errors are therefore branded with a global `Symbol.for` key and the
 * classes override `Symbol.hasInstance`, so `instanceof` keeps working no
 * matter which copy created the error.
 */
export type DomainErrorCode =
  "NOT_FOUND" | "CONFLICT" | "GONE" | "FORBIDDEN" | "UNAUTHORIZED" | "VALIDATION_ERROR" | "RATE_LIMITED";

const DOMAIN_ERROR = Symbol.for("vialb.DomainError");
const UNIQUE_VIOLATION = Symbol.for("vialb.UniqueViolationError");

interface Branded {
  [DOMAIN_ERROR]: true;
  code: DomainErrorCode;
}

function isBranded(value: unknown): value is Branded {
  return typeof value === "object" && value !== null && (value as Partial<Branded>)[DOMAIN_ERROR] === true;
}

export abstract class DomainError extends Error {
  /** Set by each concrete subclass; used for cross-bundle `instanceof`. */
  static readonly CODE: DomainErrorCode | undefined = undefined;
  readonly [DOMAIN_ERROR] = true as const;
  abstract readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.details = details;
  }

  static override [Symbol.hasInstance](instance: unknown): boolean {
    if (!isBranded(instance)) return false;
    const code = (this as unknown as { CODE?: DomainErrorCode }).CODE;
    return code === undefined || instance.code === code;
  }
}

export class NotFoundError extends DomainError {
  static override readonly CODE = "NOT_FOUND" as const;
  readonly code = "NOT_FOUND" as const;
  override readonly name = "NotFoundError";
  constructor(message = "Not found", details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class ConflictError extends DomainError {
  static override readonly CODE = "CONFLICT" as const;
  readonly code = "CONFLICT" as const;
  override readonly name = "ConflictError";
}

export type GoneReason = "expired" | "limit" | "disabled";

export class GoneError extends DomainError {
  static override readonly CODE = "GONE" as const;
  readonly code = "GONE" as const;
  override readonly name = "GoneError";
  constructor(
    readonly reason: GoneReason,
    message = "This link is no longer available",
  ) {
    super(message, { reason });
  }
}

export class ForbiddenError extends DomainError {
  static override readonly CODE = "FORBIDDEN" as const;
  readonly code = "FORBIDDEN" as const;
  override readonly name = "ForbiddenError";
  constructor(message = "You do not have access to this resource", details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class UnauthorizedError extends DomainError {
  static override readonly CODE = "UNAUTHORIZED" as const;
  readonly code = "UNAUTHORIZED" as const;
  override readonly name = "UnauthorizedError";
  constructor(message = "Authentication required") {
    super(message);
  }
}

export class ValidationError extends DomainError {
  static override readonly CODE = "VALIDATION_ERROR" as const;
  readonly code = "VALIDATION_ERROR" as const;
  override readonly name = "ValidationError";
}

export class RateLimitedError extends DomainError {
  static override readonly CODE = "RATE_LIMITED" as const;
  readonly code = "RATE_LIMITED" as const;
  override readonly name = "RateLimitedError";
  constructor(
    readonly retryAfterSeconds: number,
    message = "Too many requests, please try again later",
  ) {
    super(message, { retryAfterSeconds });
  }
}

/** Raised by repositories when a unique constraint (e.g. links.code) fails. */
export class UniqueViolationError extends Error {
  readonly [UNIQUE_VIOLATION] = true as const;
  override readonly name = "UniqueViolationError";

  constructor(readonly constraint: string | undefined) {
    super(`Unique constraint violated: ${constraint ?? "unknown"}`);
  }

  static override [Symbol.hasInstance](instance: unknown): boolean {
    return (
      typeof instance === "object" &&
      instance !== null &&
      (instance as { [UNIQUE_VIOLATION]?: true })[UNIQUE_VIOLATION] === true
    );
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return isBranded(error);
}
