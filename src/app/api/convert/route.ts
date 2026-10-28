import type { NextRequest } from "next/server";
import { getContainer } from "@/server/container";
import { errorResponse } from "@/server/http/error-mapper";
import { clientIpFrom } from "@/server/http/request-context";

/**
 * Conversion reports from a destination: `GET|POST /api/convert?cid=<vclid>&value=49.90&currency=USD`.
 * No API key: the click id is the credential (see docs/conversions.md for what that means). It is called
 * from other sites' pages and servers, so it answers CORS for everyone but never uses cookies.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
};

/** Bodies are tiny forms or JSON; anything bigger is not a conversion. */
const MAX_BODY_BYTES = 1024;

async function readFields(request: NextRequest): Promise<Record<string, string>> {
  const fields: Record<string, string> = {};
  for (const [key, value] of request.nextUrl.searchParams) fields[key] = value;
  if (request.method !== "POST") return fields;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new RangeError("too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new RangeError("too large");
  if (text === "") return fields;

  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object") {
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === "string" || typeof value === "number") fields[key] = String(value);
      }
    }
  } else {
    for (const [key, value] of new URLSearchParams(text)) fields[key] = value;
  }
  return fields;
}

async function handle(request: NextRequest): Promise<Response> {
  try {
    const fields = await readFields(request);
    await getContainer().conversions.record({
      ref: fields["cid"] ?? fields["vclid"],
      value: fields["value"],
      currency: fields["currency"],
      ip: clientIpFrom(request.headers),
    });
    // Recorded, repeated and unknown ids all look the same, so ids cannot be probed.
    return new Response(null, { status: 204, headers: CORS });
  } catch (error) {
    if (error instanceof RangeError || error instanceof SyntaxError) {
      return Response.json(
        { error: { code: "VALIDATION_ERROR", message: "Send a small form or JSON body" } },
        { status: 400, headers: CORS },
      );
    }
    return errorResponse(error, CORS);
  }
}

export const GET = handle;
export const POST = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
