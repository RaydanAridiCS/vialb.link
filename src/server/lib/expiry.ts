import { EXPIRATION_PRESET_MS, LIMITS, type ExpirationPreset } from "@/lib/constants";
import { ValidationError } from "@/server/errors";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves an expiration preset (or a custom date) into an absolute instant.
 * `now` is injected (Clock port) so the math is deterministic in tests.
 */
export function resolveExpiresAt(
  preset: ExpirationPreset,
  custom: Date | null | undefined,
  now: Date,
): Date | null {
  if (preset === "never") return null;
  if (preset === "custom") {
    if (!custom || Number.isNaN(custom.getTime())) {
      throw new ValidationError("A custom expiration date is required", { field: "expiresAt" });
    }
    if (custom.getTime() <= now.getTime()) {
      throw new ValidationError("Expiration must be in the future", { field: "expiresAt" });
    }
    if (custom.getTime() > now.getTime() + LIMITS.maxExpiryDays * DAY_MS) {
      throw new ValidationError(`Expiration can be at most ${LIMITS.maxExpiryDays} days away`, {
        field: "expiresAt",
      });
    }
    return custom;
  }
  return new Date(now.getTime() + EXPIRATION_PRESET_MS[preset]);
}

export function isExpired(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

/** Earliest of two optional expirations (used to cap anonymous links). */
export function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}
