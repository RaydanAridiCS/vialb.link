import { describe, expect, it } from "vitest";
import { applyUtm, emptyUtm, readUtm, UTM_PRESETS } from "@/features/links/utm";

describe("utm helpers", () => {
  it("reads existing utm params and ignores everything else", () => {
    const values = readUtm("https://example.com/p?utm_source=news&ref=1&utm_campaign=spring");
    expect(values).toEqual({ ...emptyUtm(), utm_source: "news", utm_campaign: "spring" });
  });

  it("returns empty values for an invalid URL", () => {
    expect(readUtm("not a url")).toEqual(emptyUtm());
  });

  it("applies params while preserving other query params and the hash", () => {
    const url = applyUtm("https://example.com/p?ref=1#top", {
      utm_source: "instagram",
      utm_medium: "social_bio",
    });
    expect(url).toBe("https://example.com/p?ref=1&utm_source=instagram&utm_medium=social_bio#top");
  });

  it("overwrites existing params and removes blank ones", () => {
    const url = applyUtm("https://example.com/?utm_source=old&utm_term=x", {
      utm_source: " new ",
      utm_term: "",
    });
    expect(url).toBe("https://example.com/?utm_source=new");
  });

  it("encodes values and leaves invalid URLs untouched", () => {
    expect(applyUtm("https://example.com", { utm_campaign: "a b&c" })).toBe(
      "https://example.com/?utm_campaign=a+b%26c",
    );
    expect(applyUtm("nope", { utm_source: "x" })).toBe("nope");
  });

  it("ships the four documented presets", () => {
    expect(UTM_PRESETS.map((p) => p.id)).toEqual(["instagram", "tiktok", "newsletter", "print"]);
  });

  describe("edge cases", () => {
    it("punycodes IDN hosts", () => {
      expect(applyUtm("https://bücher.de/p", { utm_source: "x" })).toBe(
        "https://xn--bcher-kva.de/p?utm_source=x",
      );
    });

    it("keeps explicit ports and drops default ones", () => {
      expect(applyUtm("https://example.com:8443/a?x=1", { utm_source: "x" })).toBe(
        "https://example.com:8443/a?x=1&utm_source=x",
      );
      expect(applyUtm("https://example.com:443/", { utm_source: "x" })).toBe(
        "https://example.com/?utm_source=x",
      );
    });

    it("reads the first of repeated keys and collapses them to one on apply", () => {
      const url = "https://example.com/?utm_source=a&utm_source=b&ref=1";
      expect(readUtm(url).utm_source).toBe("a");
      expect(applyUtm(url, { utm_source: "c" })).toBe("https://example.com/?utm_source=c&ref=1");
    });

    it("leaves a hash route (with its own ?) alone", () => {
      expect(applyUtm("https://example.com/#/route?x=1", { utm_source: "x" })).toBe(
        "https://example.com/?utm_source=x#/route?x=1",
      );
    });

    it("percent-encodes unicode and treats whitespace-only values as blank", () => {
      expect(applyUtm("https://example.com/", { utm_campaign: "été", utm_term: "   " })).toBe(
        "https://example.com/?utm_campaign=%C3%A9t%C3%A9",
      );
    });

    it("is idempotent: applying what was read changes nothing", () => {
      const url = "https://example.com/p?ref=1&utm_source=a&utm_medium=b#h";
      expect(applyUtm(url, readUtm(url))).toBe(url);
    });

    it("does not touch protocol-relative or relative input", () => {
      expect(applyUtm("//example.com/x", { utm_source: "x" })).toBe("//example.com/x");
      expect(applyUtm("/relative", { utm_source: "x" })).toBe("/relative");
    });
  });
});
