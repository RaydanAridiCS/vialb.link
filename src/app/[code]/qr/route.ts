import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/error-mapper";

/** Optional public QR endpoint: /{code}/qr?format=svg|png (PUBLIC_QR_ENDPOINT=true). */
export async function GET(request: NextRequest, { params }: RouteContext<"/[code]/qr">) {
  if (!env.PUBLIC_QR_ENDPOINT) return new Response("Not found", { status: 404 });
  const { code } = await params;
  const format = request.nextUrl.searchParams.get("format") === "png" ? "png" : "svg";
  try {
    const image = await getContainer().qr.forPublicCode(code, format);
    if (!image) return new Response("Not found", { status: 404 });
    return new Response(image.body as BodyInit, {
      headers: { "Content-Type": image.contentType, "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
