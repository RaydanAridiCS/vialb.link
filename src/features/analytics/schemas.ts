import { z } from "zod";
import { ANALYTICS_RANGES } from "@/lib/constants";

/** Analytics URL params (?range=7d&bots=1&from=…&to=…), shared by the page, CSV export and API. */
export const analyticsParamsSchema = z.object({
  range: z.enum(ANALYTICS_RANGES).catch("7d"),
  bots: z
    .enum(["0", "1"])
    .optional()
    .catch(undefined)
    .transform((v) => v === "1"),
  /** Compare with the previous period of equal length. On unless `compare=0`. */
  compare: z
    .enum(["0", "1"])
    .optional()
    .catch(undefined)
    .transform((v) => v !== "0"),
  from: z.coerce.date().optional().catch(undefined),
  to: z.coerce.date().optional().catch(undefined),
});

export type AnalyticsParams = z.output<typeof analyticsParamsSchema>;

export function parseAnalyticsParams(input: Record<string, string | string[] | undefined>): AnalyticsParams {
  const flat = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return analyticsParamsSchema.parse({ range: "7d", ...flat });
}
