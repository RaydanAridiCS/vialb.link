import { apiCreateLinkSchema, apiListQuerySchema, toCreateCommand } from "@/features/links/api-schemas";
import { getContainer } from "@/server/container";
import { readJson, withApiKey } from "@/server/http/api";
import { clientIpFrom } from "@/server/http/request-context";

/** GET /api/v1/links?cursor=&limit=&tag=&folder= — newest first, cursor pagination, optional filters. */
export const GET = withApiKey(async (request, { actor }) => {
  const query = apiListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const page = await getContainer().links.listByCursor(actor, query.cursor ?? null, query.limit, {
    tag: query.tag,
    folder: query.folder,
  });
  return Response.json({ data: page.items, nextCursor: page.nextCursor });
});

/** POST /api/v1/links — create a link. Same service + validation as the dashboard. */
export const POST = withApiKey(async (request, { actor }) => {
  const input = apiCreateLinkSchema.parse(await readJson(request));
  const { link } = await getContainer().links.create(actor, toCreateCommand(input), {
    ip: clientIpFrom(request.headers),
  });
  return Response.json(link, { status: 201, headers: { Location: `/api/v1/links/${link.id}` } });
});
