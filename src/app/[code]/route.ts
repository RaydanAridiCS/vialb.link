import { after, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getContainer } from "@/server/container";
import { clientIpFrom } from "@/server/http/request-context";
import { notFoundHtml } from "@/server/http/static-pages";
import { pixelPageCsp, renderPixelPage } from "@/server/lib/pixel-page";

/**
 * THE redirect hot path: GET /{code}.
 * Never 301/308 (browsers would cache them and break expiry, limits and
 * analytics); click recording runs after the response via `after()`.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[code]">) {
  const { code } = await params;
  const { redirect, analytics } = getContainer();
  const userAgent = request.headers.get("user-agent");
  const searchParams = request.nextUrl.searchParams;
  const ip = clientIpFrom(request.headers);
  const decision = await redirect.resolve({ code, userAgent, searchParams, ip, headers: request.headers });

  const noStore = { "Cache-Control": "private, no-store" };
  const scheduleClick = (linkId: string, routedBy: string | null = null) => {
    const headers = new Headers(request.headers);
    after(() => analytics.recordClick({ linkId, ip, headers, searchParams, routedBy }));
  };

  switch (decision.kind) {
    case "not_found":
      return new Response(notFoundHtml(code), {
        status: 404,
        headers: {
          ...noStore,
          "Content-Type": "text/html; charset=utf-8",
          // The page is static with inline styles and no scripts.
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        },
      });
    case "gone":
      return new Response(null, {
        status: 302,
        headers: { ...noStore, Location: `/gone/${encodeURIComponent(code)}?reason=${decision.reason}` },
      });
    case "password": {
      const query = searchParams.toString();
      return new Response(null, {
        status: 307,
        headers: { ...noStore, Location: `/p/${encodeURIComponent(code)}${query ? `?${query}` : ""}` },
      });
    }
    case "preview":
      scheduleClick(decision.linkId);
      return new Response(decision.html, {
        status: 200,
        headers: {
          ...noStore,
          "Content-Type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
          // The preview page has no scripts at all.
          "Content-Security-Policy":
            "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; frame-ancestors 'none'",
        },
      });
    case "pixel": {
      const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
      const html = renderPixelPage({
        destination: decision.destination,
        pixels: decision.pixels,
        mode: decision.consent,
        nonce,
      });
      scheduleClick(decision.linkId, decision.routedBy);
      // A stored value that cannot be rendered safely must not break the link: plain redirect instead.
      if (html === null) {
        return new Response(null, {
          status: env.REDIRECT_STATUS,
          headers: { ...noStore, Location: decision.destination, "Referrer-Policy": env.REFERRER_POLICY },
        });
      }
      return new Response(html, {
        status: 200,
        headers: {
          ...noStore,
          "Content-Type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
          "Content-Security-Policy": pixelPageCsp(nonce),
        },
      });
    }
    case "redirect":
      scheduleClick(decision.linkId, decision.routedBy);
      return new Response(null, {
        status: env.REDIRECT_STATUS,
        headers: { ...noStore, Location: decision.destination, "Referrer-Policy": env.REFERRER_POLICY },
      });
  }
}

/** Link checkers often send HEAD: answer without consuming an access or recording a click. */
export async function HEAD(_request: NextRequest, { params }: RouteContext<"/[code]">) {
  const { code } = await params;
  const reachable = await getContainer().redirect.isReachable(code);
  return new Response(null, {
    status: reachable ? 200 : 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}
