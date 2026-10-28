import type { HealthReason } from "@/server/domain/types";

export type ProbeFailureReason = Exclude<HealthReason, "unsafe">;

export interface ProbeResult {
  /** `true` also covers "reachable but the site refused us" (401, 403, 429): we cannot tell, so we stay quiet. */
  ok: boolean;
  /** Status of the last response received, when there was one. */
  status: number | null;
  reason: ProbeFailureReason | null;
  /** Where the redirect chain ended. */
  finalUrl: string | null;
}

/** Checks whether a URL answers, following redirects safely. Never reads a response body. */
export interface UrlProbe {
  probe(url: string): Promise<ProbeResult>;
}
