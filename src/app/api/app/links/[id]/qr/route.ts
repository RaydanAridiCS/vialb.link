import { getContainer } from "@/server/container";
import { qrOptionsFromQuery } from "@/server/http/qr-query";
import { withSession } from "@/server/http/session-route";

/**
 * Dashboard QR download:
 * /api/app/links/{id}/qr?format=png|svg&fg=%23000000&bg=%23FFFFFF&size=1024&ecc=H&frame=badge&frameText=Scan%20me
 * Anything not given falls back to the design saved on the link.
 */
export const GET = withSession<{ id: string }>(async (request, actor, { id }) => {
  const sp = request.nextUrl.searchParams;
  const format = sp.get("format") === "svg" ? "svg" : "png";
  const options = qrOptionsFromQuery(sp, 1024);
  const image = await getContainer().qr.forOwnedLink(actor, id, format, options);
  const headers: Record<string, string> = {
    "Content-Type": image.contentType,
    "Cache-Control": "private, no-store",
  };
  if (sp.get("download") === "1") {
    const hiRes = format === "png" && (options.size ?? 0) >= 2048 ? "-hires" : "";
    headers["Content-Disposition"] = `attachment; filename="qr-${id}${hiRes}.${format}"`;
  }
  return new Response(image.body as BodyInit, { headers });
});
