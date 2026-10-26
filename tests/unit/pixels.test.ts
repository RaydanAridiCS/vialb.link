import { describe, expect, it } from "vitest";
import {
  CONSENT_COOKIE,
  hasPixels,
  normalizePixels,
  optsOutOfTracking,
  parseConsent,
  pixelsProblem,
} from "@/lib/pixels";

describe("normalizePixels", () => {
  it("trims, upper-cases Google IDs and drops empty entries", () => {
    expect(normalizePixels({ meta: " 123456789012345 ", google: " g-abcd1234 " })).toEqual({
      meta: "123456789012345",
      google: "G-ABCD1234",
    });
    expect(normalizePixels({ meta: "", google: "AW-12345678" })).toEqual({ google: "AW-12345678" });
  });

  it("returns null when nothing is left", () => {
    expect(normalizePixels(null)).toBeNull();
    expect(normalizePixels(undefined)).toBeNull();
    expect(normalizePixels({ meta: "  ", google: "" })).toBeNull();
  });
});

describe("pixelsProblem", () => {
  it("accepts real-looking IDs", () => {
    expect(pixelsProblem({ meta: "12345678" })).toBeNull();
    expect(pixelsProblem({ meta: "12345678901234567890" })).toBeNull();
    for (const google of ["G-ABCD1234", "AW-123456789", "GTM-ABC123"]) {
      expect(pixelsProblem({ google })).toBeNull();
    }
    expect(pixelsProblem(null)).toBeNull();
  });

  it("rejects anything that could be script, or just is not an ID", () => {
    const badMeta = [
      "1234567",
      "123456789012345678901",
      "12 345 678",
      '1"};alert(1)//',
      "abc12345678",
      "1e10000000",
    ];
    for (const meta of badMeta) expect(pixelsProblem({ meta }), meta).toMatch(/Meta Pixel/);
    const badGoogle = [
      "G-",
      "UA-12345678",
      "G-abc",
      "G-ABC'+alert(1)+'",
      "GTM-ABC<script>",
      "AW-123 456",
      "G-ABCD1234;",
    ];
    for (const google of badGoogle) expect(pixelsProblem({ google }), google).toMatch(/Google tag/);
  });
});

describe("hasPixels", () => {
  it("is true only when at least one ID is set", () => {
    expect(hasPixels({ meta: "12345678" })).toBe(true);
    expect(hasPixels({ google: "G-ABCD1234" })).toBe(true);
    expect(hasPixels({})).toBe(false);
    expect(hasPixels(null)).toBe(false);
  });
});

describe("parseConsent", () => {
  it("reads the remembered choice among other cookies", () => {
    expect(parseConsent(`a=1; ${CONSENT_COOKIE}=granted; b=2`)).toBe("granted");
    expect(parseConsent(`${CONSENT_COOKIE}=denied`)).toBe("denied");
  });

  it("treats a missing or unexpected value as not chosen", () => {
    expect(parseConsent(null)).toBeNull();
    expect(parseConsent("")).toBeNull();
    expect(parseConsent("a=1")).toBeNull();
    expect(parseConsent(`${CONSENT_COOKIE}=maybe`)).toBeNull();
    expect(parseConsent(`x${CONSENT_COOKIE}=granted`)).toBeNull();
  });
});

describe("optsOutOfTracking", () => {
  it("honours Global Privacy Control and Do Not Track", () => {
    expect(optsOutOfTracking(new Headers({ "Sec-GPC": "1" }))).toBe(true);
    expect(optsOutOfTracking(new Headers({ DNT: "1" }))).toBe(true);
  });

  it("does not trigger on other values or no headers", () => {
    expect(optsOutOfTracking(new Headers({ "Sec-GPC": "0", DNT: "0" }))).toBe(false);
    expect(optsOutOfTracking(new Headers())).toBe(false);
    expect(optsOutOfTracking(undefined)).toBe(false);
  });
});
