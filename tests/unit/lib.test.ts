import { describe, expect, it } from "vitest";
import { CODE_ALPHABET } from "@/lib/constants";
import { NanoidCodeGenerator } from "@/server/adapters/basic";
import { ValidationError } from "@/server/errors";
import { csvField, csvRow } from "@/server/lib/csv";
import { earliest, isExpired, resolveExpiresAt } from "@/server/lib/expiry";
import { randomToken, safeEqualHex, sha256Hex, utcDay, visitorHash } from "@/server/lib/hashing";
import { escapeHtml, renderPreviewHtml } from "@/server/lib/html";
import { extractUtm, forwardQuery } from "@/server/lib/query";
import { getClientIp, parseReferrer } from "@/server/lib/request";
import { hostMatchesDomain, isBlockedHost, normalizeDomainEntry, parseHttpUrl } from "@/server/lib/url";
import { isAnyBot, isPreviewBot, parseUserAgent, primaryLanguage } from "@/server/lib/user-agent";

const now = new Date("2026-06-01T12:00:00Z");

describe("code generator", () => {
  it("uses the look-alike-free alphabet and requested length", () => {
    const gen = new NanoidCodeGenerator();
    for (const ch of "0OIl1") expect(CODE_ALPHABET).not.toContain(ch);
    const codes = Array.from({ length: 500 }, () => gen.generate(7));
    for (const code of codes) {
      expect(code).toHaveLength(7);
      expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    }
    expect(new Set(codes).size).toBe(codes.length);
    expect(gen.generate(9)).toHaveLength(9);
  });
});

describe("expiry math", () => {
  it("resolves presets relative to the injected clock", () => {
    expect(resolveExpiresAt("never", null, now)).toBeNull();
    expect(resolveExpiresAt("10m", null, now)?.toISOString()).toBe("2026-06-01T12:10:00.000Z");
    expect(resolveExpiresAt("24h", null, now)?.toISOString()).toBe("2026-06-02T12:00:00.000Z");
    expect(resolveExpiresAt("30d", null, now)?.toISOString()).toBe("2026-07-01T12:00:00.000Z");
  });
  it("validates custom dates", () => {
    const future = new Date("2026-07-01T00:00:00Z");
    expect(resolveExpiresAt("custom", future, now)).toEqual(future);
    expect(() => resolveExpiresAt("custom", null, now)).toThrow(ValidationError);
    expect(() => resolveExpiresAt("custom", new Date("2026-05-01T00:00:00Z"), now)).toThrow(/future/);
    expect(() => resolveExpiresAt("custom", new Date("2027-07-01T00:00:00Z"), now)).toThrow(/365/);
  });
  it("detects expiry and picks the earliest date", () => {
    expect(isExpired(null, now)).toBe(false);
    expect(isExpired(now, now)).toBe(true);
    expect(isExpired(new Date(now.getTime() + 1), now)).toBe(false);
    const a = new Date("2026-01-01");
    const b = new Date("2026-02-01");
    expect(earliest(a, b)).toBe(a);
    expect(earliest(null, b)).toBe(b);
    expect(earliest(a, null)).toBe(a);
  });
});

describe("OG preview HTML", () => {
  it("escapes every interpolated value", () => {
    expect(escapeHtml(`<script>"'&\``)).toBe("&lt;script&gt;&quot;&#39;&amp;&#96;");
    const html = renderPreviewHtml({
      siteName: "Vialb",
      shortUrl: "https://sho.rt/abc",
      title: `"><script>alert(1)</script>`,
      description: `<img src=x onerror=alert(1)>`,
      imageUrl: `https://img.example/a.png" onload="x`,
      destinationUrl: "https://dest.example/?q=<b>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('" onload="');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toMatch(/http-equiv/i);
  });
  it("omits the destination when none is given (protected links)", () => {
    const html = renderPreviewHtml({
      siteName: "Vialb",
      shortUrl: "https://sho.rt/abc",
      title: "Protected",
      description: null,
      imageUrl: null,
      destinationUrl: null,
    });
    expect(html).not.toContain("dest.example");
    expect(html).toContain('content="summary"');
  });
});

describe("query forwarding and UTM", () => {
  it("appends incoming params and keeps destination params + fragment", () => {
    expect(forwardQuery("https://d.example/p?a=1#frag", new URLSearchParams("utm_source=x&b=2"))).toBe(
      "https://d.example/p?a=1&utm_source=x&b=2#frag",
    );
    expect(forwardQuery("https://d.example/", new URLSearchParams())).toBe("https://d.example/");
    expect(forwardQuery("not a url", new URLSearchParams("a=1"))).toBe("not a url");
  });
  it("extracts UTM values from the short link query string", () => {
    expect(extractUtm(new URLSearchParams("utm_source=hn&utm_medium=%20&utm_campaign=launch&x=1"))).toEqual({
      utm_source: "hn",
      utm_medium: null,
      utm_campaign: "launch",
      utm_term: null,
      utm_content: null,
    });
    expect(extractUtm(new URLSearchParams(`utm_source=${"a".repeat(500)}`)).utm_source).toHaveLength(200);
  });
});

describe("hashing", () => {
  it("hashes visitors without exposing the IP and rotates with the salt", () => {
    const a = visitorHash("198.51.100.1", "UA", "salt-1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("198.51");
    expect(visitorHash("198.51.100.1", "UA", "salt-1")).toBe(a);
    expect(visitorHash("198.51.100.1", "UA", "salt-2")).not.toBe(a);
    expect(visitorHash(null, null, "s")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("provides helpers", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(safeEqualHex(sha256Hex("a"), sha256Hex("a"))).toBe(true);
    expect(safeEqualHex(sha256Hex("a"), sha256Hex("b"))).toBe(false);
    expect(safeEqualHex("ab", "abcd")).toBe(false);
    expect(utcDay(new Date("2026-03-04T23:59:59Z"))).toBe("2026-03-04");
  });
});

describe("user agent parsing", () => {
  const chromeMac =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const ipad =
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

  it("classifies browsers, OS and devices", () => {
    expect(parseUserAgent(chromeMac)).toMatchObject({
      browser: "Chrome",
      browserVersion: "130",
      os: "macOS",
      deviceType: "desktop",
      isBot: false,
    });
    expect(parseUserAgent(iphone)).toMatchObject({ os: "iOS", deviceType: "mobile", isBot: false });
    expect(parseUserAgent(ipad).deviceType).toBe("tablet");
    expect(parseUserAgent(null)).toMatchObject({ browser: null, deviceType: "other", isBot: false });
  });

  it("detects crawlers and preview bots", () => {
    for (const ua of [
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Twitterbot/1.0",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "WhatsApp/2.23.20.0",
      "TelegramBot (like TwitterBot)",
      "LinkedInBot/1.0",
    ]) {
      expect(isPreviewBot(ua)).toBe(true);
      expect(parseUserAgent(ua)).toMatchObject({ isBot: true, deviceType: "bot" });
    }
    expect(isAnyBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isAnyBot(chromeMac)).toBe(false);
    expect(isAnyBot(null)).toBe(false);
  });

  it("extracts the primary language", () => {
    expect(primaryLanguage("en-US,en;q=0.9,fr;q=0.8")).toBe("en-US");
    expect(primaryLanguage("*")).toBeNull();
    expect(primaryLanguage("<script>")).toBeNull();
    expect(primaryLanguage(null)).toBeNull();
  });
});

describe("client IP and referrer", () => {
  const h = (xff: string) => new Headers({ "x-forwarded-for": xff });
  it("uses the socket address (right-most) without TRUST_PROXY", () => {
    expect(getClientIp(h("10.0.0.5"), { trustProxy: false, trustedHops: 1 })).toBe("10.0.0.5");
    expect(getClientIp(new Headers(), { trustProxy: false, trustedHops: 1 })).toBeNull();
  });
  it("walks trusted hops from the right with TRUST_PROXY", () => {
    const headers = h("6.6.6.6, 203.0.113.9, 10.0.0.2");
    expect(getClientIp(headers, { trustProxy: true, trustedHops: 1 })).toBe("10.0.0.2");
    expect(getClientIp(headers, { trustProxy: true, trustedHops: 2 })).toBe("203.0.113.9");
    expect(getClientIp(headers, { trustProxy: true, trustedHops: 9 })).toBe("6.6.6.6");
  });
  it("normalises ports, brackets and mapped addresses and rejects garbage", () => {
    expect(getClientIp(h("203.0.113.9:4321"), { trustProxy: false, trustedHops: 1 })).toBe("203.0.113.9");
    expect(getClientIp(h("[2001:db8::1]:443"), { trustProxy: false, trustedHops: 1 })).toBe("2001:db8::1");
    expect(getClientIp(h("::ffff:192.0.2.1"), { trustProxy: false, trustedHops: 1 })).toBe("192.0.2.1");
    expect(getClientIp(h("not-an-ip"), { trustProxy: false, trustedHops: 1 })).toBeNull();
  });
  it("parses referrers without query strings", () => {
    expect(parseReferrer("https://www.Google.com/search?q=secret#x")).toEqual({
      host: "google.com",
      url: "https://www.google.com/search",
    });
    expect(parseReferrer("android-app://com.slack")).toEqual({ host: null, url: null });
    expect(parseReferrer("garbage")).toEqual({ host: null, url: null });
    expect(parseReferrer(null)).toEqual({ host: null, url: null });
  });
});

describe("url helpers", () => {
  it("parses only http(s)", () => {
    expect(parseHttpUrl("https://a.example")?.hostname).toBe("a.example");
    expect(parseHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseHttpUrl("nope")).toBeNull();
  });
  it("matches blocked domains including subdomains", () => {
    expect(hostMatchesDomain("www.Evil.example", "evil.example")).toBe(true);
    expect(hostMatchesDomain("a.b.evil.example", "evil.example")).toBe(true);
    expect(hostMatchesDomain("notevil.example", "evil.example")).toBe(false);
    expect(isBlockedHost("x.bad.test", ["good.test", "bad.test"])).toBe(true);
  });
  it("normalises blocklist entries", () => {
    expect(normalizeDomainEntry(" https://WWW.Evil.example/path ")).toBe("evil.example");
    expect(normalizeDomainEntry("*.spam.test")).toBe("spam.test");
    expect(normalizeDomainEntry("# comment")).toBeNull();
    expect(normalizeDomainEntry("localhost")).toBeNull();
    expect(normalizeDomainEntry("")).toBeNull();
  });
});

describe("csv", () => {
  it("escapes quotes, separators and formula injection", () => {
    expect(csvField('a "b", c')).toBe('"a ""b"", c"');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField(null)).toBe("");
    expect(csvField(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01T00:00:00.000Z");
    expect(csvRow([1, true, "x"])).toBe("1,true,x\r\n");
  });
});
