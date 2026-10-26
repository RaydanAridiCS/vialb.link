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
});
