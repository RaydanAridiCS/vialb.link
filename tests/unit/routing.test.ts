import { describe, expect, it } from "vitest";
import {
  describeRoute,
  describeRule,
  hasCriteria,
  needsGeo,
  normalizeCountries,
  pickRoute,
  routingProblem,
  ruleMatches,
  type RoutingRule,
  type Visitor,
} from "@/lib/routing";
import { LIMITS } from "@/lib/constants";
import { detectPlatform } from "@/server/lib/user-agent";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const OLD_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1";
const IPADOS_AS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const PIXEL =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";
const CHROMEOS =
  "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SMART_TV =
  "Mozilla/5.0 (SMART-TV; Linux; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 108.0.5359.1/7.0 TV Safari/537.36";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const SLACKBOT = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";

describe("detectPlatform", () => {
  it.each([
    ["an iPhone", IPHONE, "ios"],
    ["an older iPad", OLD_IPAD, "ios"],
    ["an Android phone", PIXEL, "android"],
    ["an Android tablet", ANDROID_TABLET, "android"],
    ["Windows", WINDOWS, "desktop"],
    ["Linux", LINUX, "desktop"],
    ["a Mac", IPADOS_AS_MAC, "desktop"],
    ["ChromeOS", CHROMEOS, "desktop"],
  ] as const)("recognises %s", (_name, userAgent, expected) => {
    expect(detectPlatform(userAgent)).toBe(expected);
  });

  it("documents the iPadOS limitation: Safari on a new iPad pretends to be a Mac", () => {
    expect(detectPlatform(IPADOS_AS_MAC)).toBe("desktop");
  });

  it.each([
    ["a smart TV", SMART_TV],
    ["Googlebot", GOOGLEBOT],
    ["a link-preview bot", SLACKBOT],
    ["no User-Agent", null],
    ["an empty User-Agent", ""],
    ["nonsense", "definitely-not-a-browser"],
  ])("returns nothing for %s", (_name, userAgent) => {
    expect(detectPlatform(userAgent)).toBeNull();
  });
});

describe("ruleMatches", () => {
  const visitor = (platform: Visitor["platform"], country: Visitor["country"] = null): Visitor => ({
    platform,
    country,
  });

  it("matches a platform-only rule on that platform", () => {
    const rule: RoutingRule = { platform: "ios", url: "https://a.example" };
    expect(ruleMatches(rule, visitor("ios"))).toBe(true);
    expect(ruleMatches(rule, visitor("android"))).toBe(false);
    expect(ruleMatches(rule, visitor(null))).toBe(false);
  });

  it("matches a country-only rule on any device, but never when the country is unknown", () => {
    const rule: RoutingRule = { countries: ["FR", "DE"], url: "https://a.example" };
    expect(ruleMatches(rule, visitor("ios", "FR"))).toBe(true);
    expect(ruleMatches(rule, visitor(null, "DE"))).toBe(true);
    expect(ruleMatches(rule, visitor("ios", "US"))).toBe(false);
    expect(ruleMatches(rule, visitor("ios", null))).toBe(false);
  });

  it("needs both conditions when a rule sets both", () => {
    const rule: RoutingRule = { platform: "android", countries: ["IN"], url: "https://a.example" };
    expect(ruleMatches(rule, visitor("android", "IN"))).toBe(true);
    expect(ruleMatches(rule, visitor("android", "US"))).toBe(false);
    expect(ruleMatches(rule, visitor("ios", "IN"))).toBe(false);
  });

  it("never matches a rule without conditions", () => {
    expect(ruleMatches({ url: "https://a.example" }, visitor("ios", "US"))).toBe(false);
    expect(ruleMatches({ countries: [], url: "https://a.example" }, visitor("ios", "US"))).toBe(false);
    expect(hasCriteria({ url: "https://a.example" })).toBe(false);
  });
});

describe("pickRoute", () => {
  const rules: RoutingRule[] = [
    { platform: "ios", countries: ["FR"], url: "https://fr-ios.example" },
    { platform: "ios", url: "https://ios.example" },
    { countries: ["FR"], url: "https://fr.example" },
    { platform: "desktop", url: "https://desktop.example" },
  ];

  it("returns the first matching rule, its position and a label", () => {
    expect(pickRoute(rules, { platform: "ios", country: "FR" })).toMatchObject({
      index: 0,
      label: "ios+country:FR",
      rule: { url: "https://fr-ios.example" },
    });
    expect(pickRoute(rules, { platform: "ios", country: "US" })).toMatchObject({ index: 1, label: "ios" });
    expect(pickRoute(rules, { platform: "android", country: "FR" })).toMatchObject({
      index: 2,
      label: "country:FR",
    });
    expect(pickRoute(rules, { platform: "desktop", country: null })).toMatchObject({
      index: 3,
      label: "desktop",
    });
  });

  it("returns nothing when no rule matches", () => {
    expect(pickRoute(rules, { platform: "android", country: "US" })).toBeNull();
    expect(pickRoute(rules, { platform: null, country: null })).toBeNull();
    expect(pickRoute([], { platform: "ios", country: "FR" })).toBeNull();
  });

  it("labels with the visitor's country, not the whole list, so labels stay few", () => {
    const route = pickRoute([{ countries: ["FR", "DE", "ES"], url: "https://eu.example" }], {
      platform: null,
      country: "DE",
    });
    expect(route?.label).toBe("country:DE");
  });

  it("an earlier, broader rule hides a later, narrower one", () => {
    const shadowed: RoutingRule[] = [
      { platform: "ios", url: "https://any-ios.example" },
      { platform: "ios", countries: ["FR"], url: "https://fr-ios.example" },
    ];
    expect(pickRoute(shadowed, { platform: "ios", country: "FR" })?.rule.url).toBe("https://any-ios.example");
  });
});

describe("needsGeo", () => {
  it("is only true when some rule has countries", () => {
    expect(needsGeo([])).toBe(false);
    expect(needsGeo([{ platform: "ios", url: "https://a.example" }])).toBe(false);
    expect(needsGeo([{ countries: [], platform: "ios", url: "https://a.example" }])).toBe(false);
    expect(
      needsGeo([
        { platform: "ios", url: "https://a.example" },
        { countries: ["US"], url: "https://b.example" },
      ]),
    ).toBe(true);
  });
});

describe("normalizeCountries", () => {
  it("upper-cases, trims, drops blanks and duplicates, and keeps order", () => {
    expect(normalizeCountries([" fr", "DE ", "", "fr", "us"])).toEqual(["FR", "DE", "US"]);
  });

  it("is idempotent", () => {
    const once = normalizeCountries(["fr", " De", "FR"]);
    expect(normalizeCountries(once)).toEqual(once);
  });
});

describe("routingProblem", () => {
  const ok: RoutingRule = { platform: "ios", url: "https://a.example" };

  it("accepts a sensible set", () => {
    expect(routingProblem([ok, { countries: ["FR"], url: "https://b.example" }])).toBeNull();
    expect(routingProblem([])).toBeNull();
  });

  it("requires every rule to have a condition", () => {
    expect(routingProblem([ok, { url: "https://b.example" }])).toMatch(/Rule 2: choose a device/);
  });

  it("limits the number of rules and of countries", () => {
    const many = Array.from({ length: LIMITS.routingRulesMax + 1 }, (_, i) => ({
      countries: [`A${String.fromCharCode(65 + (i % 26))}`],
      url: `https://${i}.example`,
    }));
    expect(routingProblem(many)).toMatch(/at most 10 routing rules/);
    const codes = Array.from({ length: LIMITS.routingCountriesMax + 1 }, (_, i) => {
      const a = String.fromCharCode(65 + Math.floor(i / 26));
      const b = String.fromCharCode(65 + (i % 26));
      return `${a}${b}`;
    });
    expect(routingProblem([{ countries: codes, url: "https://a.example" }])).toMatch(/at most 50 countries/);
  });

  it.each(["USA", "U", "1A", "U S", ""])("rejects the country code %j", (code) => {
    expect(routingProblem([{ countries: [code], url: "https://a.example" }])).toMatch(/two-letter/);
  });

  it("rejects a rule that could never fire because an earlier one has the same conditions", () => {
    expect(
      routingProblem([
        { platform: "ios", countries: ["FR", "DE"], url: "https://a.example" },
        { platform: "ios", countries: ["DE", "FR"], url: "https://b.example" },
      ]),
    ).toMatch(/Rule 2 has the same conditions/);
  });
});

describe("describeRule", () => {
  it("reads naturally", () => {
    expect(describeRule({ platform: "ios", url: "x" })).toBe("iPhone & iPad");
    expect(describeRule({ platform: "android", countries: ["US", "CA"], url: "x" })).toBe(
      "Android in US, CA",
    );
    expect(describeRule({ countries: ["FR"], url: "x" })).toBe("Any device in FR");
  });
});

describe("describeRoute", () => {
  const names: Record<string, string> = { FR: "France", DE: "Germany" };
  const name = (code: string) => names[code] ?? code;

  it("turns stored labels into words for the analytics page", () => {
    expect(describeRoute("default")).toBe("Default destination");
    expect(describeRoute("ios")).toBe("iPhone & iPad");
    expect(describeRoute("android")).toBe("Android");
    expect(describeRoute("country:FR", name)).toBe("France");
    expect(describeRoute("android+country:DE", name)).toBe("Android · Germany");
  });

  it("shows the raw code when no names are available, and passes unknown parts through", () => {
    expect(describeRoute("country:FR")).toBe("FR");
    expect(describeRoute("future-label")).toBe("future-label");
  });

  it("understands every label pickRoute can produce", () => {
    const route = pickRoute([{ platform: "desktop", countries: ["DE"], url: "https://a.example" }], {
      platform: "desktop",
      country: "DE",
    });
    expect(route && describeRoute(route.label, name)).toBe("Desktop · Germany");
  });
});
