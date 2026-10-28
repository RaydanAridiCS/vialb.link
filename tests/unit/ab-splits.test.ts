import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/constants";
import {
  describeRoute,
  hasCriteria,
  pickRoute,
  pickVariant,
  routingIssue,
  ruleMatches,
  type RoutingRule,
} from "@/lib/routing";
import { splitBucket } from "@/server/lib/hashing";
import { ValidationError } from "@/server/errors";
import { buildFixture, defined, users } from "../support/fixtures";

const ab = (a = 50, b = 50): RoutingRule => ({
  url: "https://a.example/",
  variants: [
    { url: "https://a.example/", weight: a },
    { url: "https://b.example/", weight: b },
  ],
});

describe("pickVariant", () => {
  it("lays the weights end to end", () => {
    const v = [{ weight: 70 }, { weight: 30 }];
    expect([0, 69].map((b) => pickVariant(v, b))).toEqual([0, 0]);
    expect([70, 99].map((b) => pickVariant(v, b))).toEqual([1, 1]);
  });

  it("handles edge weights and three-way splits", () => {
    expect(pickVariant([{ weight: 1 }, { weight: 99 }], 0)).toBe(0);
    expect(pickVariant([{ weight: 1 }, { weight: 99 }], 1)).toBe(1);
    const three = [{ weight: 20 }, { weight: 30 }, { weight: 50 }];
    expect([19, 20, 49, 50, 99].map((b) => pickVariant(three, b))).toEqual([0, 1, 1, 2, 2]);
  });

  it("falls back to the last variant when weights do not add up", () => {
    expect(pickVariant([{ weight: 10 }, { weight: 10 }], 80)).toBe(1);
  });

  it("every bucket from 0 to 99 maps to exactly the configured share", () => {
    const shares = [25, 25, 50];
    const counts = [0, 0, 0];
    for (let b = 0; b < 100; b++) {
      const index = pickVariant(
        shares.map((weight) => ({ weight })),
        b,
      );
      counts[index] = (counts[index] ?? 0) + 1;
    }
    expect(counts).toEqual(shares);
  });
});

describe("splitBucket", () => {
  it("is stable for the same visitor, link and rule, and independent across them", () => {
    expect(splitBucket("v1", "link", 0)).toBe(splitBucket("v1", "link", 0));
    const values = new Set([
      splitBucket("v1", "link", 0),
      splitBucket("v1", "link", 1),
      splitBucket("v1", "other", 0),
      splitBucket("v2", "link", 0),
    ]);
    expect(values.size).toBeGreaterThan(1);
  });

  it("stays within 0-99 and spreads evenly", () => {
    const counts = new Array<number>(100).fill(0);
    for (let i = 0; i < 20_000; i++) {
      const b = splitBucket(`visitor-${i}`, "link-1", 0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
      counts[b] = (counts[b] ?? 0) + 1;
    }
    // Expected 200 per bucket; a fair hash stays well inside +-50%.
    expect(Math.min(...counts)).toBeGreaterThan(100);
    expect(Math.max(...counts)).toBeLessThan(300);
  });

  it("splits a population close to the configured weights", () => {
    const rule = ab(70, 30);
    let first = 0;
    const total = 20_000;
    for (let i = 0; i < total; i++) {
      const bucket = splitBucket(`visitor-${i}`, "link-9", 0);
      if (pickVariant(defined(rule.variants), bucket) === 0) first++;
    }
    expect(first / total).toBeGreaterThan(0.68);
    expect(first / total).toBeLessThan(0.72);
  });
});

describe("routing rules with variants", () => {
  it("a split with no conditions matches everyone, and labels the chosen variant", () => {
    const rule = ab();
    expect(hasCriteria(rule)).toBe(true);
    expect(ruleMatches(rule, { platform: null, country: null })).toBe(true);
    const a = pickRoute([rule], { platform: null, country: null, bucket: () => 10 });
    const b = pickRoute([rule], { platform: null, country: null, bucket: () => 60 });
    expect(a).toMatchObject({ url: "https://a.example/", variant: 0, label: "variant:A" });
    expect(b).toMatchObject({ url: "https://b.example/", variant: 1, label: "variant:B" });
  });

  it("combines with device and country conditions in the label", () => {
    const rule = { ...ab(), platform: "ios" as const, countries: ["FR"] };
    expect(pickRoute([rule], { platform: "android", country: "FR", bucket: () => 0 })).toBeNull();
    expect(pickRoute([rule], { platform: "ios", country: "FR", bucket: () => 99 })?.label).toBe(
      "ios+country:FR+variant:B",
    );
  });

  it("uses the first variant when no bucket is supplied, and each rule gets its own bucket", () => {
    expect(pickRoute([ab()], { platform: null, country: null })?.variant).toBe(0);
    const seen: number[] = [];
    pickRoute([{ platform: "ios", url: "https://i.example/" }, ab()], {
      platform: "desktop",
      country: null,
      bucket: (index) => (seen.push(index), 0),
    });
    expect(seen).toEqual([1]);
  });

  it("a rule without variants behaves as before", () => {
    const rule: RoutingRule = { platform: "ios", url: "https://apps.example/" };
    expect(pickRoute([rule], { platform: "ios", country: null })).toMatchObject({
      url: "https://apps.example/",
      variant: null,
      label: "ios",
    });
  });

  it("describes variants for the analytics page", () => {
    expect(describeRoute("variant:B")).toBe("Variant B");
    expect(describeRoute("ios+variant:A")).toBe("iPhone & iPad · Variant A");
    expect(describeRoute("country:FR+variant:C", () => "France")).toBe("France · Variant C");
  });
});

describe("routingIssue for splits", () => {
  const issue = (rule: RoutingRule) => routingIssue([rule])?.message ?? null;

  it("accepts good splits, including a three-way one", () => {
    expect(issue(ab())).toBeNull();
    expect(issue(ab(1, 99))).toBeNull();
    expect(
      issue({
        url: "https://a.example/",
        variants: [
          { url: "https://a.example/", weight: 34 },
          { url: "https://b.example/", weight: 33, label: "Short page" },
          { url: "https://c.example/", weight: 33 },
        ],
      }),
    ).toBeNull();
  });

  it.each([
    ["shares that do not add up", ab(60, 30), /add up to 90%/],
    ["shares over 100", ab(60, 60), /add up to 120%/],
    ["a zero share", ab(0, 100), /whole-number share/],
    ["a fractional share", ab(50.5, 49.5), /whole-number share/],
    [
      "a single variant",
      { url: "https://a.example/", variants: [{ url: "https://a.example/", weight: 100 }] },
      /between 2 and 5/,
    ],
    ["an empty list", { url: "https://a.example/", variants: [] }, /between 2 and 5/],
    [
      "too many variants",
      {
        url: "https://a.example/",
        variants: Array.from({ length: 6 }, (_, i) => ({
          url: `https://${i}.example/`,
          weight: i === 0 ? 20 : 16,
        })),
      },
      /between 2 and 5/,
    ],
    [
      "the same destination twice",
      {
        url: "https://a.example/",
        variants: [
          { url: "https://a.example/", weight: 50 },
          { url: "https://a.example/", weight: 50 },
        ],
      },
      /must be different/,
    ],
    [
      "a very long name",
      {
        url: "https://a.example/",
        variants: [
          { url: "https://a.example/", weight: 50, label: "x".repeat(LIMITS.routingVariantLabelMax + 1) },
          { url: "https://b.example/", weight: 50 },
        ],
      },
      /at most 20/,
    ],
  ] as [string, RoutingRule, RegExp][])("rejects %s", (_name, rule, message) => {
    expect(issue(rule)).toMatch(message);
  });

  it("two catch-all splits make the second useless", () => {
    expect(routingIssue([ab(), ab()])?.message).toMatch(/never be used|would never/);
  });

  it("a rule with neither conditions nor variants is still refused", () => {
    expect(issue({ url: "https://a.example/" })).toMatch(/split the traffic/);
  });
});

describe("A/B split on the redirect path", () => {
  async function seed(random?: () => number) {
    const f = buildFixture({ random });
    const { link } = await f.links.create(
      users.alice,
      {
        destinationUrl: "https://default.example/",
        customCode: "split",
        routingRules: [
          {
            url: "https://a.example/landing",
            variants: [
              { url: "https://a.example/landing", weight: 50 },
              { url: "https://b.example/landing", weight: 50, label: "New page" },
            ],
          },
        ],
      },
      { ip: null },
    );
    return { f, link };
  }
  const resolve = (
    f: Awaited<ReturnType<typeof seed>>["f"],
    ip: string | null,
    ua = "Mozilla/5.0 Chrome/130",
  ) => f.redirect.resolve({ code: "split", userAgent: ua, searchParams: new URLSearchParams(), ip });

  it("sends the same visitor to the same variant all day, and different visitors to both", async () => {
    const { f } = await seed();
    const seen = new Map<string, Set<string>>();
    const hosts = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const ip = `203.0.113.${i}`;
      for (let visit = 0; visit < 3; visit++) {
        const d = await resolve(f, ip);
        if (d.kind !== "redirect") throw new Error(d.kind);
        const host = new URL(d.destination).host;
        (seen.get(ip) ?? seen.set(ip, new Set()).get(ip))?.add(host);
        hosts.add(host);
      }
    }
    expect([...seen.values()].every((s) => s.size === 1)).toBe(true);
    expect(hosts).toEqual(new Set(["a.example", "b.example"]));
  });

  it("splits close to 50/50 over many visitors and records which variant fired", async () => {
    const { f } = await seed();
    let a = 0;
    const total = 600;
    for (let i = 0; i < total; i++) {
      const d = await resolve(f, `198.51.${Math.floor(i / 250)}.${i % 250}`);
      if (d.kind !== "redirect") throw new Error(d.kind);
      expect(["variant:A", "variant:B"]).toContain(d.routedBy);
      if (d.routedBy === "variant:A") a++;
    }
    expect(a / total).toBeGreaterThan(0.43);
    expect(a / total).toBeLessThan(0.57);
  });

  it("the assignment changes with the day's salt (a new day reshuffles visitors)", async () => {
    const { f } = await seed();
    const day1 = new Map<string, string>();
    for (let i = 0; i < 60; i++) {
      const d = await resolve(f, `192.0.2.${i}`);
      if (d.kind === "redirect") day1.set(`192.0.2.${i}`, defined(d.routedBy));
    }
    f.clock.advance(24 * 3_600_000);
    let changed = 0;
    for (const [ip, label] of day1) {
      const d = await resolve(f, ip);
      if (d.kind === "redirect" && d.routedBy !== label) changed++;
    }
    expect(changed).toBeGreaterThan(10);
  });

  it("without a client address it draws at random through the injected generator", async () => {
    const { f } = await seed(() => 0.1);
    const low = await resolve(f, null);
    expect(low).toMatchObject({ kind: "redirect", routedBy: "variant:A" });
    const { f: g } = await seed(() => 0.9);
    expect(await resolve(g, null)).toMatchObject({ kind: "redirect", routedBy: "variant:B" });
  });

  it("the click records the variant, and analytics shows how many each got", async () => {
    const { f, link } = await seed();
    for (let i = 0; i < 40; i++) {
      const d = await resolve(f, `203.0.114.${i}`);
      if (d.kind !== "redirect") throw new Error(d.kind);
      await f.analytics.recordClick({
        linkId: d.linkId,
        ip: `203.0.114.${i}`,
        headers: new Headers({ "user-agent": "Mozilla/5.0 Chrome/130" }),
        searchParams: new URLSearchParams(),
        routedBy: d.routedBy,
      });
    }
    f.clock.advance(60_000);
    const data = await f.analytics.getLinkAnalytics(users.alice, link.id, {
      range: "7d",
      includeBots: false,
    });
    const rows = data.dimensions.routed_by;
    expect(rows.map((r) => r.value).sort()).toEqual(["variant:A", "variant:B"]);
    expect(rows.reduce((n, r) => n + r.clicks, 0)).toBe(40);
  });

  it("forwarding query parameters and conversion ids still apply to the chosen variant", async () => {
    const { f, link } = await seed();
    await f.links.update(users.alice, link.id, { conversionsEnabled: true });
    const d = await f.redirect.resolve({
      code: "split",
      userAgent: "Mozilla/5.0 Chrome/130",
      searchParams: new URLSearchParams("utm_source=x"),
      ip: "203.0.113.5",
    });
    if (d.kind !== "redirect") throw new Error(d.kind);
    const url = new URL(d.destination);
    expect(["a.example", "b.example"]).toContain(url.host);
    expect(url.searchParams.get("utm_source")).toBe("x");
    expect(url.searchParams.get("vclid")).toBe(d.clickRef);
  });
});

describe("saving splits", () => {
  it("makes the first variant the control, trims, and checks every destination", async () => {
    const f = buildFixture({ blockedDomains: ["evil.example"] });
    const { link } = await f.links.create(
      users.alice,
      {
        destinationUrl: "https://default.example/",
        routingRules: [
          {
            url: "https://ignored.example/",
            variants: [
              { url: " https://a.example/ ", weight: 50, label: "  Control " },
              { url: "https://b.example/", weight: 50 },
            ],
          },
        ],
      },
      { ip: null },
    );
    expect(link.routingRules[0]).toEqual({
      url: "https://a.example/",
      variants: [
        { url: "https://a.example/", weight: 50, label: "Control" },
        { url: "https://b.example/", weight: 50 },
      ],
    });
    await expect(
      f.links.update(users.alice, link.id, {
        routingRules: [
          {
            url: "https://a.example/",
            variants: [
              { url: "https://a.example/", weight: 50 },
              { url: "https://sub.evil.example/", weight: 50 },
            ],
          },
        ],
      }),
    ).rejects.toThrow(/Rule 1/);
    await expect(f.links.update(users.alice, link.id, { routingRules: [ab(70, 20)] })).rejects.toThrow(
      ValidationError,
    );
  });

  it("the health monitor checks every variant", async () => {
    const f = buildFixture({ healthMonitorEnabled: true });
    await f.links.create(
      users.alice,
      { destinationUrl: "https://default.example/", routingRules: [ab()] },
      { ip: null },
    );
    await f.healthMonitor.runDue();
    expect(f.probe.calls.sort()).toEqual([
      "https://a.example/",
      "https://b.example/",
      "https://default.example/",
    ]);
  });
});
