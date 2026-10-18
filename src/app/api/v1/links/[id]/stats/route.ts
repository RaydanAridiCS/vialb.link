import { z } from "zod";
import { apiStatsQuerySchema } from "@/features/links/api-schemas";
import { getContainer } from "@/server/container";
import { withApiKey } from "@/server/http/api";

/** GET /api/v1/links/{id}/stats?from&to — defaults to the last 30 days, humans only. */
export const GET = withApiKey<{ id: string }>(async (request, { actor }, { id }) => {
  const query = apiStatsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const stats = await getContainer().analytics.getLinkStats(
    actor,
    z.uuid().parse(id),
    query.from ? new Date(query.from) : undefined,
    query.to ? new Date(query.to) : undefined,
  );
  return Response.json(stats);
});
