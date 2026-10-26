import { z } from "zod";
import { getContainer } from "@/server/container";
import { NotFoundError } from "@/server/errors";
import { withApiKey } from "@/server/http/api";
import { qrOptionsFromQuery } from "@/server/http/qr-query";

/**
 * GET /api/v1/links/{id}/qr.png | qr.svg
 * Optional ?fg=%23000000&bg=%23FFFFFF&size=512&ecc=H&frame=badge&frameText=Scan%20me (default: the link's saved design)
 */
export const GET = withApiKey<{ id: string; file: string }>(async (request, { actor }, { id, file }) => {
  const format = file === "qr.png" ? "png" : file === "qr.svg" ? "svg" : null;
  if (!format) throw new NotFoundError("Unknown resource");
  const sp = request.nextUrl.searchParams;
  const image = await getContainer().qr.forOwnedLink(
    actor,
    z.uuid().parse(id),
    format,
    qrOptionsFromQuery(sp),
  );
  return new Response(image.body as BodyInit, { headers: { "Content-Type": image.contentType } });
});
