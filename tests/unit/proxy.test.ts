import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { RESERVED_CODES } from "@/lib/constants";
import { proxy } from "@/proxy";

const get = (pathname: string) => proxy(new NextRequest(`http://localhost:3000${pathname}`));

describe("proxy content-security-policy", () => {
  it("gives app pages a nonce CSP", () => {
    for (const page of ["/", "/sign-in", "/dashboard", "/privacy", "/p/abc1234"]) {
      const response = get(page);
      expect(response.headers.get("content-security-policy"), page).toMatch(/script-src 'self' 'nonce-/);
    }
  });

  it("leaves short-code responses to the redirect route, so its own CSP is not replaced", () => {
    for (const code of ["abc1234", "Launch-2026", "a_b", "XyZ"]) {
      const response = get(`/${code}`);
      expect(response.headers.get("content-security-policy"), code).toBeNull();
      // Everything else still applies.
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
    }
  });

  it("keeps public stats pages out of search results and out of Referer headers, under the page CSP", () => {
    const response = get("/stats/Zm9vYmFyYmF6cXV4MTIzNA");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toMatch(/script-src 'self' 'nonce-/);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    // Other pages are untouched.
    expect(get("/dashboard").headers.get("x-robots-tag")).toBeNull();
  });

  it("still protects bio pages, which also have a single path segment", () => {
    expect(get("/@alice").headers.get("content-security-policy")).toMatch(/nonce-/);
  });
});

/** Top-level folders under src/app that become a first path segment, ignoring route groups. */
function topLevelSegments(dir: string): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const isDir = statSync(full).isDirectory();
    if (isDir && entry.startsWith("(")) {
      names.push(...topLevelSegments(full));
    } else if (isDir && !entry.startsWith("[") && !entry.startsWith("@") && !entry.startsWith("_")) {
      names.push(entry);
    } else if (!isDir && /^(opengraph-image|twitter-image)\.tsx?$/.test(entry)) {
      // Files with a dot in their URL (icon.svg, robots.txt) can never be a short code.
      names.push(entry.replace(/\.tsx?$/, ""));
    }
  }
  return names;
}

describe("top-level routes", () => {
  // The proxy treats any other single-segment path as a short code, so a new top-level page that is not
  // reserved would silently lose its CSP (and could be shadowed by a link with that code).
  it("are all reserved short codes", () => {
    const segments = topLevelSegments(path.join(process.cwd(), "src", "app"));
    expect(segments.length).toBeGreaterThan(8);
    const missing = segments.filter((segment) => !RESERVED_CODES.has(segment.toLowerCase()));
    expect(missing).toEqual([]);
  });
});
