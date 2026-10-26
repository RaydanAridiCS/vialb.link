import type { NextRequest } from "next/server";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/error-mapper";

/**
 * The designed social card of a link: /{code}/card. Public on purpose: link-preview crawlers (Slack,
 * WhatsApp, X…) fetch it without credentials. It is drawn from the design alone and 404s for links that
 * have no card or are not live. The `?v=` in the preview URL changes with the design, so a day of
 * caching is safe; `?download=1` serves it as a file.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[code]/card">) {
  const { code } = await params;
  try {
    const image = await getContainer().card.forCode(code);
    if (!image) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    const download = request.nextUrl.searchParams.get("download") === "1";
    return new Response(image.body as BodyInit, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=86400",
        ...(download ? { "Content-Disposition": `attachment; filename="${image.filename}"` } : {}),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
