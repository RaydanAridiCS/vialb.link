import { parseAnalyticsParams } from "@/features/analytics/schemas";
import { getContainer } from "@/server/container";
import { withSession } from "@/server/http/session-route";

/** Streams raw clicks for the selected range as CSV (no IPs are stored, so none are exported). */
export const GET = withSession<{ id: string }>(async (request, actor, { id }) => {
  const params = parseAnalyticsParams(Object.fromEntries(request.nextUrl.searchParams));
  const stream = await getContainer().analytics.exportClicksCsv(actor, id, {
    range: params.range,
    from: params.from,
    to: params.to,
    includeBots: params.bots,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clicks-${id}-${params.range}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
});
