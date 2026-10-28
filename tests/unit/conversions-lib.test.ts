import { randomToken } from "@/server/lib/hashing";
import { describe, expect, it } from "vitest";
import {
  appendClickRef,
  conversionRate,
  CURRENCIES,
  formatMinor,
  isClickRef,
  MAX_CONVERSION_VALUE,
  normalizeCurrency,
  parseConversionValue,
} from "@/lib/conversions";

describe("click ids", () => {
  it("accepts exactly 16 url-safe characters", () => {
    expect(isClickRef("abcdefghijklmnop")).toBe(true);
    expect(isClickRef("AB_-12cdEFGH3456")).toBe(true);
    for (const bad of [
      "",
      "short",
      "abcdefghijklmnopq",
      "abcdefghijklmno!",
      "abcdefghijklmno ",
      "abcdefghijklmn\n\n",
      null,
      12,
      undefined,
    ]) {
      expect(isClickRef(bad), String(bad)).toBe(false);
    }
  });

  it("matches what the generator produces (12 random bytes)", () => {
    for (let i = 0; i < 200; i++) expect(isClickRef(randomToken(12))).toBe(true);
  });
});

describe("parseConversionValue", () => {
  it.each([
    ["49", 4900],
    ["49.9", 4990],
    ["49.90", 4990],
    ["0", 0],
    ["0.01", 1],
    ["  12.5 ", 1250],
    ["1000000000", 100_000_000_000],
  ])("%j → %i", (raw, minor) => {
    expect(parseConversionValue(raw)).toBe(minor);
  });

  it.each([
    "",
    "-1",
    "+5",
    "1e3",
    "1,000",
    "1.234",
    "12.",
    ".5",
    "abc",
    "1000000000.01",
    "1000000001",
    "99999999999",
    "NaN",
    "0x10",
    "5 USD",
  ])("rejects %j", (raw) => {
    expect(parseConversionValue(raw)).toBeNull();
  });

  it("never exceeds the cap", () => {
    expect(parseConversionValue(String(MAX_CONVERSION_VALUE))).toBe(MAX_CONVERSION_VALUE * 100);
    expect(parseConversionValue(String(MAX_CONVERSION_VALUE + 1))).toBeNull();
  });
});

describe("normalizeCurrency", () => {
  it("upper-cases and checks the list", () => {
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency(" eur ")).toBe("EUR");
    for (const bad of ["", "US", "USDD", "XXX", "BTC", "usd; drop"])
      expect(normalizeCurrency(bad), bad).toBeNull();
    expect(new Set(CURRENCIES).size).toBe(CURRENCIES.length);
  });
});

describe("appendClickRef", () => {
  it("adds vclid, keeps the rest, and replaces a vclid that was already there", () => {
    expect(appendClickRef("https://a.example/p?x=1#top", "REF1234567890123")).toBe(
      "https://a.example/p?x=1&vclid=REF1234567890123#top",
    );
    expect(appendClickRef("https://a.example/p?vclid=forged&x=1", "REF1234567890123")).toBe(
      "https://a.example/p?vclid=REF1234567890123&x=1",
    );
  });
  it("leaves non-http destinations and garbage alone", () => {
    expect(appendClickRef("mailto:a@b.c", "REF1234567890123")).toBe("mailto:a@b.c");
    expect(appendClickRef("not a url", "REF1234567890123")).toBe("not a url");
  });
});

describe("conversionRate / formatMinor", () => {
  it("rounds to one decimal and is null without clicks", () => {
    expect(conversionRate(1, 3)).toBe(33.3);
    expect(conversionRate(2, 3)).toBe(66.7);
    expect(conversionRate(5, 5)).toBe(100);
    expect(conversionRate(0, 10)).toBe(0);
    expect(conversionRate(3, 0)).toBeNull();
  });
  it("formats minor units", () => {
    expect(formatMinor(4990, "USD")).toBe("$49.90");
    expect(formatMinor(100, "EUR")).toBe("€1.00");
    expect(formatMinor(250, "ZZZ?")).toBe("2.50 ZZZ?");
  });
});
