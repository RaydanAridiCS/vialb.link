import { z } from "zod";
import { getContainer } from "@/server/container";
import { NotFoundError } from "@/server/errors";
import { withApiKey } from "@/server/http/api";

/** GET /api/v1/links/{id}/qr.png | qr.svg — optional ?fg=%23000000&bg=%23FFFFFF&size=512 */
export const GET = withApiKey<{ id: string; file: string }>(async (request, { actor }, { id, file }) => {
  const format = file === "qr.png" ? "png" : file === "qr.svg" ? "svg" : null;
  if (!format) throw new NotFoundError("Unknown resource");
  const sp = request.nextUrl.searchParams;
  const image = await getContainer().qr.forOwnedLink(actor, z.uuid().parse(id), format, {
    fg: sp.get("fg") ?? undefined,
    bg: sp.get("bg") ?? undefined,
    size: sp.has("size") ? Number(sp.get("size")) : undefined,
  });
  return new Response(image.body as BodyInit, { headers: { "Content-Type": image.contentType } });
});
