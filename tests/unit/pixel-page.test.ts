import { describe, expect, it } from "vitest";
import { pixelPageCsp, renderPixelPage } from "@/server/lib/pixel-page";

const NONCE = "bm9uY2U=";
const base = {
  destination: "https://news.example/story?id=1&ref=a",
  pixels: { meta: "123456789012345", google: "G-ABCD1234" },
  mode: "ask" as const,
  nonce: NONCE,
};

describe("renderPixelPage", () => {
  it("puts the settings in escaped data attributes, never in the script", () => {
    const html = renderPixelPage(base) ?? "";
    expect(html).toContain('data-mode="ask"');
    expect(html).toContain('data-dest="https://news.example/story?id=1&amp;ref=a"');
    expect(html).toContain('data-meta="123456789012345"');
    expect(html).toContain('data-google="G-ABCD1234"');
    const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(script).not.toContain("123456789012345");
    expect(script).not.toContain("news.example");
  });

  it("gives both inline tags the nonce, and loads nothing from an ad platform in the markup", () => {
    const html = renderPixelPage(base) ?? "";
    expect(html).toContain(`<script nonce="${NONCE}">`);
    expect(html).toContain(`<style nonce="${NONCE}">`);
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<img/);
  });

  it("offers a way to decline and a no-script fallback", () => {
    const html = renderPixelPage(base) ?? "";
    expect(html).toContain("Accept and continue");
    expect(html).toContain("Continue without tracking");
    expect(html).toMatch(/<noscript>[\s\S]*href="https:\/\/news\.example\/story\?id=1&amp;ref=a"/);
  });

  it("omits the attribute of a tag that is not set", () => {
    const html = renderPixelPage({ ...base, pixels: { google: "GTM-ABC123" } }) ?? "";
    expect(html).not.toContain("data-meta");
    expect(html).toContain('data-google="GTM-ABC123"');
  });

  it("escapes a hostile destination into the attribute", () => {
    const html =
      renderPixelPage({ ...base, destination: 'https://x.example/"><script>alert(1)</script>' }) ?? "";
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("refuses values it cannot render safely", () => {
    expect(renderPixelPage({ ...base, destination: "javascript:alert(1)" })).toBeNull();
    expect(renderPixelPage({ ...base, destination: "//evil.example/" })).toBeNull();
    expect(renderPixelPage({ ...base, pixels: { meta: '1"onload="x' } })).toBeNull();
    expect(renderPixelPage({ ...base, pixels: { google: "G-ABC';alert(1)//" } })).toBeNull();
  });

  it("uses no orange", () => {
    const html = renderPixelPage(base) ?? "";
    expect(html).not.toMatch(/orange|#e5531a|#d04a12|#f0703a/i);
  });
});

describe("pixelPageCsp", () => {
  const csp = pixelPageCsp(NONCE);
  const directive = (name: string) => csp.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";

  it("only runs scripts that carry the nonce, and lets those load the ad tags", () => {
    expect(directive("script-src")).toBe(`script-src 'nonce-${NONCE}' 'strict-dynamic'`);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("locks everything else down", () => {
    expect(directive("default-src")).toBe("default-src 'none'");
    expect(directive("form-action")).toBe("form-action 'none'");
    expect(directive("base-uri")).toBe("base-uri 'none'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  it("lets the tags send their data to Meta and Google", () => {
    expect(directive("connect-src")).toContain("https://www.facebook.com");
    expect(directive("connect-src")).toContain("https://www.googletagmanager.com");
    expect(directive("connect-src")).toContain("https://*.google-analytics.com");
  });
});
