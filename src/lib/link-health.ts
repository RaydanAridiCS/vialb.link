import type { HealthReason } from "@/server/domain/types";

/** Plain-language explanation of why a destination was flagged, for the dashboard and emails. */
export const HEALTH_REASON_LABELS: Record<HealthReason, string> = {
  not_found: "The page was not found (404 or 410)",
  server_error: "The destination returned a server error",
  timeout: "The destination did not answer in time",
  redirect_loop: "The destination redirects in a loop",
  too_many_redirects: "The destination redirects too many times",
  dns: "The domain could not be found",
  tls: "The destination has a certificate problem",
  blocked_target: "The destination points at a private or disallowed address",
  network: "The destination could not be reached",
  unsafe: "Flagged as unsafe by Google Safe Browsing",
};

export function describeHealthReason(reason: HealthReason | null): string {
  return reason ? HEALTH_REASON_LABELS[reason] : "Needs attention";
}
