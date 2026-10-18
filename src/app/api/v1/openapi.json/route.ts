import { buildOpenApiDocument } from "@/features/links/openapi";
import { env } from "@/lib/env";

let cached: string | null = null;

export async function GET() {
  cached ??= JSON.stringify(buildOpenApiDocument(env.SITE_URL));
  return new Response(cached, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
