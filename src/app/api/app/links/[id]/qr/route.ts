import { getContainer } from "@/server/container";
import { withSession } from "@/server/http/session-route";

/** Dashboard QR download: /api/app/links/{id}/qr?format=png|svg&fg=%23000000&bg=%23FFFFFF&size=1024 */
export const GET = withSession<{ id: string }>(async (request, actor, { id }) => {
  const sp = request.nextUrl.searchParams;
  const format = sp.get("format") === "svg" ? "svg" : "png";
  const image = await getContainer().qr.forOwnedLink(actor, id, format, {
    fg: sp.get("fg") ?? undefined,
    bg: sp.get("bg") ?? undefined,
    size: sp.has("size") ? Number(sp.get("size")) : 1024,
  });
  const headers: Record<string, string> = {
    "Content-Type": image.contentType,
    "Cache-Control": "private, no-store",
  };
  if (sp.get("download") === "1")
    headers["Content-Disposition"] = `attachment; filename="qr-${id}.${format}"`;
  return new Response(image.body as BodyInit, { headers });
});
