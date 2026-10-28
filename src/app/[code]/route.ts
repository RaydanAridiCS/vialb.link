import { after, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getContainer } from "@/server/container";
import { clientIpFrom } from "@/server/http/request-context";
import { goneHtml, interstitialHtml, notFoundHtml, staticPageCsp } from "@/server/http/static-pages";
import { pixelPageCsp, renderPixelPage } from "@/server/lib/pixel-page";

/**
 * THE redirect hot path: GET /{code}.
 * Never 301/308 (browsers would cache them and break expiry, limits and
 * analytics); click recording runs after the response via `after()`.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/[code]">) {
  const { code } = await params;
  const { redirect, analytics, settings } = getContainer();
  const userAgent = request.headers.get("user-agent");
  const searchParams = request.nextUrl.searchParams;
  const ip = clientIpFrom(request.headers);
  const decision = await redirect.resolve({ code, userAgent, searchParams, ip, headers: request.headers });

  const noStore = { "Cache-Control": "private, no-store" };
  const scheduleClick = (linkId: string, routedBy: string | null = null, clickRef: string | null = null) => {
    const headers = new Headers(request.headers);
    after(() => analytics.recordClick({ linkId, ip, headers, searchParams, routedBy, clickRef }));
  };

  switch (decision.kind) {
    case "not_found": {
      const { branding } = await settings.get();
      return new Response(notFoundHtml(code, branding), {
        status: 404,
        headers: {
          ...noStore,
          "Content-Type": "text/html; charset=utf-8",
          // The page is static with inline styles and no scripts.
          "Content-Security-Policy": staticPageCsp(branding),
        },
      });
    }
    case "gone": {
      // A real 410: crawlers and link checkers learn the link is gone, and the visitor sees the explanation.
      const { branding } = await settings.get();
      return new Response(goneHtml(decision.reason, code, branding), {
        status: 410,
        headers: {
          ...noStore,
          "Content-Type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
          "Content-Security-Policy": staticPageCsp(branding),
        },
      });
    }
    case "interstitial": {
      scheduleClick(decision.linkId, decision.routedBy, decision.clickRef);
      const { branding } = await settings.get();
      return new Response(interstitialHtml(decision.destination, code, branding, env.REFERRER_POLICY), {
        status: 200,
        headers: {
          ...noStore,
          "Content-Type": "text/html; charset=utf-8",
          "X-Robots-Tag": "noindex, nofollow",
          "Content-Security-Policy": staticPageCsp(branding),
        },
      });
    }
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
      scheduleClick(decision.linkId, decision.routedBy, decision.clickRef);
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
      scheduleClick(decision.linkId, decision.routedBy, decision.clickRef);
      return new Response(null, {
        status: env.REDIRECT_STATUS,
        headers: { ...noStore, Location: decision.destination, "Referrer-Policy": env.REFERRER_POLICY },
      });
  }
}

/** Link checkers often send HEAD: answer without consuming an access or recording a click. */
export async function HEAD(_request: NextRequest, { params }: RouteContext<"/[code]">) {
  const { code } = await params;
  const status = await getContainer().redirect.headStatus(code);
  return new Response(null, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
