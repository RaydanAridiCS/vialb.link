import type { NextRequest } from "next/server";

/**
 * Legacy compatibility: the previous app served short links under /s/{code}.
 * A permanent redirect to /{code} is safe here because the target itself is
 * never cached (it answers 302 + no-store), so printed links keep working.
 * The 308 itself is marked no-store too: it is cacheable by default, and a
 * cached hop would let a CDN skip a later change to the redirect.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/s/[code]">) {
  const { code } = await params;
  const query = request.nextUrl.searchParams.toString();
  return new Response(null, {
    status: 308,
    headers: {
      Location: `/${encodeURIComponent(code)}${query ? `?${query}` : ""}`,
      "Cache-Control": "private, no-store",
    },
  });
}
