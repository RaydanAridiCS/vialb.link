import { UniqueViolationError } from "@/server/errors";

interface PgErrorLike {
  code?: string;
  constraint_name?: string;
  constraint?: string;
  cause?: unknown;
}

/** Finds the underlying Postgres error (Drizzle wraps driver errors in `cause`). */
function findPgError(error: unknown): PgErrorLike | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const candidate = current as PgErrorLike;
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) return candidate;
    current = candidate.cause;
  }
  return null;
}

/** Re-throws unique violations (SQLSTATE 23505) as a typed `UniqueViolationError`. */
export function rethrowUniqueViolation(error: unknown): never {
  const pg = findPgError(error);
  if (pg?.code === "23505") {
    throw new UniqueViolationError(pg.constraint_name ?? pg.constraint);
  }
  throw error;
}
