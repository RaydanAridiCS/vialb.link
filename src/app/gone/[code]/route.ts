import type { NextRequest } from "next/server";
import { getContainer } from "@/server/container";
import { goneHtml, isGoneReason, staticPageCsp } from "@/server/http/static-pages";

/**
 * The "gone" page at its own address, kept so old links and the password form's failure redirect still land
 * somewhere sensible. Same page and the same real 410 as `/{code}` serves directly.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/gone/[code]">) {
  const { code } = await params;
  const asked = request.nextUrl.searchParams.get("reason");
  const reason = isGoneReason(asked) ? asked : "disabled";
  const { branding } = await getContainer().settings.get();
  return new Response(goneHtml(reason, code, branding), {
    status: 410,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": staticPageCsp(branding),
    },
  });
}
