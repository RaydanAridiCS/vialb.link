import { describe, expect, it } from "vitest";
import { isClickRef } from "@/lib/conversions";
import { RATE_LIMITS } from "@/lib/constants";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { buildFixture, defined, users } from "../support/fixtures";

const DAY = 86_400_000;
const IP = "203.0.113.9";

async function seed(options: Parameters<typeof buildFixture>[0] = {}) {
  const f = buildFixture(options);
  const { link } = await f.links.create(
    users.alice,
    { destinationUrl: "https://shop.example/landing?x=1", customCode: "shop" },
    { ip: null },
  );
  await f.links.update(users.alice, link.id, { conversionsEnabled: true });
  return { f, link };
}

/** Follows the link like a visitor and records the click like the route handler does. */
async function visit(f: ReturnType<typeof buildFixture>, code = "shop", extra: { bot?: boolean } = {}) {
  const human = "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0";
  const recordedAs = extra.bot ? "curl/8.5.0 python-requests bot" : human;
  const decision = await f.redirect.resolve({
    code,
    userAgent: human,
    searchParams: new URLSearchParams(),
    ip: IP,
  });
  if (decision.kind !== "redirect") throw new Error(`expected a redirect, got ${decision.kind}`);
  await f.analytics.recordClick({
    linkId: decision.linkId,
    ip: IP,
    headers: new Headers({ "user-agent": recordedAs }),
    searchParams: new URLSearchParams(),
    routedBy: decision.routedBy,
    clickRef: decision.clickRef,
  });
  f.clock.advance(1000); // ranges are half-open: a click at exactly "now" is not in a range ending now
  return decision;
}

describe("redirect with conversion tracking", () => {
  it("adds a fresh random vclid to the destination and stores it with the click", async () => {
    const { f } = await seed();
    const a = await visit(f);
    const b = await visit(f);
    expect(a.clickRef).not.toBeNull();
    expect(isClickRef(a.clickRef)).toBe(true);
    expect(a.clickRef).not.toBe(b.clickRef);
    expect(new URL(a.destination).searchParams.get("vclid")).toBe(a.clickRef);
    expect(new URL(a.destination).searchParams.get("x")).toBe("1");
    expect(f.clickRepo.rows.map((c) => c.clickRef)).toEqual([a.clickRef, b.clickRef]);
  });

  it("is derived from nothing about the visitor", async () => {
    const { f } = await seed();
    const refs = new Set<string>();
    for (let i = 0; i < 30; i++) refs.add(defined((await visit(f)).clickRef));
    expect(refs.size).toBe(30); // same address and browser every time, a different id every time
  });

  it("overrides a vclid the visitor or a campaign put in the short link's query", async () => {
    const { f } = await seed();
    const decision = await f.redirect.resolve({
      code: "shop",
      userAgent: "Mozilla/5.0 Chrome/130",
      searchParams: new URLSearchParams("vclid=forgedforgedforg&utm_source=x"),
      ip: IP,
    });
    if (decision.kind !== "redirect") throw new Error("expected redirect");
    const url = new URL(decision.destination);
    expect(url.searchParams.getAll("vclid")).toEqual([decision.clickRef]);
    expect(url.searchParams.get("utm_source")).toBe("x");
  });

  it("does nothing for links that do not track conversions", async () => {
    const f = buildFixture();
    await f.links.create(
      users.alice,
      { destinationUrl: "https://plain.example/", customCode: "plain" },
      { ip: null },
    );
    const decision = await visit(f, "plain");
    expect(decision.clickRef).toBeNull();
    expect(decision.destination).toBe("https://plain.example/");
    expect(f.clickRepo.rows[0]?.clickRef).toBeNull();
  });

  it("gives crawler previews no id and records none", async () => {
    const { f } = await seed();
    const decision = await f.redirect.resolve({
      code: "shop",
      userAgent: "facebookexternalhit/1.1",
      searchParams: new URLSearchParams(),
      ip: IP,
    });
    expect(decision.kind).toBe("preview");
  });

  it("puts the id on the pixel consent page's destination as well", async () => {
    const f = buildFixture({ pixelsEnabled: true });
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://shop.example/", customCode: "pix", pixels: { meta: "123456789" } },
      { ip: null },
    );
    await f.links.update(users.alice, link.id, { conversionsEnabled: true });
    const decision = await f.redirect.resolve({
      code: "pix",
      userAgent: "Mozilla/5.0 Chrome/130",
      searchParams: new URLSearchParams(),
      ip: IP,
      headers: new Headers(),
    });
    expect(decision.kind).toBe("pixel");
    if (decision.kind === "pixel") {
      expect(new URL(decision.destination).searchParams.get("vclid")).toBe(decision.clickRef);
    }
  });

  it("is also added after a password unlock", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://shop.example/", customCode: "locked", password: "hunter22" },
      { ip: null },
    );
    await f.links.update(users.alice, link.id, { conversionsEnabled: true });
    const result = await f.redirect.unlock({ code: "locked", password: "hunter22", ip: IP });
    expect(isClickRef(result.clickRef)).toBe(true);
    expect(new URL(result.destination).searchParams.get("vclid")).toBe(result.clickRef);
  });
});

describe("ConversionService.record", () => {
  it("records a conversion once, with its value, and treats a repeat as a duplicate", async () => {
    const { f } = await seed();
    const { clickRef } = await visit(f);
    expect(await f.conversions.record({ ref: clickRef, value: "49.90", currency: "usd", ip: IP })).toBe(
      "recorded",
    );
    expect(f.conversionRepo.rows).toMatchObject([{ valueMinor: 4990, currency: "USD" }]);
    expect(await f.conversions.record({ ref: clickRef, value: "10", currency: "USD", ip: IP })).toBe(
      "duplicate",
    );
    expect(f.conversionRepo.rows).toHaveLength(1);
    expect(f.conversionRepo.rows[0]?.valueMinor).toBe(4990); // the first report stands
  });

  it("accepts a conversion without a value", async () => {
    const { f } = await seed();
    const { clickRef } = await visit(f);
    expect(await f.conversions.record({ ref: clickRef, ip: IP })).toBe("recorded");
    expect(f.conversionRepo.rows[0]).toMatchObject({ valueMinor: null, currency: null });
  });

  it("rejects malformed ids and amounts before looking anything up", async () => {
    const { f } = await seed();
    const { clickRef } = await visit(f);
    for (const ref of [undefined, "", "short", "x".repeat(17), "abcdefghijklmno!", 42]) {
      await expect(f.conversions.record({ ref, ip: IP }), String(ref)).rejects.toThrow(ValidationError);
    }
    const bad: { value?: string; currency?: string }[] = [
      { value: "-5", currency: "USD" },
      { value: "1.234", currency: "USD" },
      { value: "1e5", currency: "USD" },
      { value: "5", currency: "XXX" },
      { value: "5" },
      { currency: "USD" },
      { value: "1000000001", currency: "USD" },
    ];
    for (const amount of bad) {
      await expect(
        f.conversions.record({ ref: clickRef, ip: IP, ...amount }),
        JSON.stringify(amount),
      ).rejects.toThrow(ValidationError);
    }
    expect(f.conversionRepo.rows).toHaveLength(0);
  });

  it("silently ignores unknown ids, disabled links, bots and stale clicks (no probing)", async () => {
    const { f, link } = await seed({ conversionWindowDays: 30 });
    expect(await f.conversions.record({ ref: "AAAAAAAAAAAAAAAA", ip: IP })).toBe("ignored");

    const { clickRef } = await visit(f);
    f.clock.advance(31 * DAY);
    expect(await f.conversions.record({ ref: clickRef, ip: IP })).toBe("ignored");
    f.clock.advance(-31 * DAY);
    expect(await f.conversions.record({ ref: clickRef, ip: IP })).toBe("recorded");

    const second = await visit(f);
    await f.links.update(users.alice, link.id, { conversionsEnabled: false });
    expect(await f.conversions.record({ ref: second.clickRef, ip: IP })).toBe("ignored");
    await f.links.update(users.alice, link.id, { conversionsEnabled: true });

    const bot = await visit(f, "shop", { bot: true });
    expect(await f.conversions.record({ ref: bot.clickRef, ip: IP })).toBe("ignored");
  });

  it("accepts a conversion right up to the end of the window", async () => {
    const { f } = await seed({ conversionWindowDays: 30 });
    const { clickRef } = await visit(f);
    f.clock.advance(30 * DAY - 1000);
    expect(await f.conversions.record({ ref: clickRef, ip: IP })).toBe("recorded");
  });

  it("rate limits per address and per link", async () => {
    const { f } = await seed();
    const { clickRef } = await visit(f);
    for (let i = 0; i < RATE_LIMITS.convertPerIp.limit; i++) {
      await f.conversions.record({ ref: clickRef, ip: "198.51.100.1" });
    }
    await expect(f.conversions.record({ ref: clickRef, ip: "198.51.100.1" })).rejects.toThrow(
      RateLimitedError,
    );
    // Another sender is not affected by that address being limited.
    await expect(f.conversions.record({ ref: clickRef, ip: "198.51.100.2" })).resolves.toBe("duplicate");

    const { f: g } = await seed();
    const refs = [];
    for (let i = 0; i < 3; i++) refs.push((await visit(g)).clickRef);
    for (let i = 0; i < RATE_LIMITS.convertPerLink.limit; i++)
      g.limiter.consume("convert:link:" + defined(g.clickRepo.rows[0]?.linkId), 1200, 60_000);
    await expect(g.conversions.record({ ref: refs[0], ip: "198.51.100.3" })).rejects.toThrow(
      RateLimitedError,
    );
  });

  it("stores nothing that identifies a person", async () => {
    const { f } = await seed();
    const { clickRef } = await visit(f);
    await f.conversions.record({ ref: clickRef, value: "5", currency: "EUR", ip: IP });
    const stored = JSON.stringify(f.conversionRepo.rows);
    expect(stored).not.toContain(IP);
    expect(Object.keys(f.conversionRepo.rows[0] ?? {}).sort()).toEqual([
      "at",
      "clickId",
      "currency",
      "linkId",
      "valueMinor",
    ]);
  });
});

describe("conversion analytics", () => {
  it("reports conversions, the cohort rate, value per currency and a breakdown by route", async () => {
    const { f, link } = await seed();
    for (let i = 0; i < 4; i++) {
      const { clickRef } = await visit(f);
      if (i < 2) await f.conversions.record({ ref: clickRef, value: "10", currency: "USD", ip: IP });
    }
    const last = await visit(f);
    await f.conversions.record({ ref: last.clickRef, value: "7.5", currency: "EUR", ip: IP });
    await visit(f, "shop", { bot: true }); // a bot click: not counted

    const data = await f.analytics.getLinkAnalytics(users.alice, link.id, {
      range: "7d",
      includeBots: false,
    });
    const c = defined(data.conversions);
    expect(c).toMatchObject({ conversions: 3, eligibleClicks: 5, rate: 60 });
    expect(c.values).toEqual([
      { currency: "EUR", totalMinor: 750, count: 1 },
      { currency: "USD", totalMinor: 2000, count: 2 },
    ]);
    expect(c.byCountry).toMatchObject([{ value: "FR", clicks: 5, conversions: 3, rate: 60 }]);
  });

  it("is absent for links that do not track conversions, and the previous period is compared", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://a.example/" },
      { ip: null },
    );
    const none = await f.analytics.getLinkAnalytics(users.alice, link.id, {
      range: "7d",
      includeBots: false,
    });
    expect(none.conversions).toBeUndefined();

    const { f: g, link: tracked } = await seed();
    const { clickRef } = await visit(g);
    await g.conversions.record({ ref: clickRef, ip: IP });
    const withPrev = await g.analytics.getLinkAnalytics(users.alice, tracked.id, {
      range: "7d",
      includeBots: false,
    });
    expect(withPrev.conversions?.previous).toEqual({ conversions: 0, eligibleClicks: 0, rate: null });
  });

  it("conversions follow their click away when clicks are pruned", async () => {
    const { f } = await seed();
    const { clickRef } = await visit(f);
    await f.conversions.record({ ref: clickRef, ip: IP });
    await f.clickRepo.deleteOlderThan(new Date(f.clock.now().getTime() + DAY), 10);
    f.conversionRepo.cascadeDeletedClicks();
    expect(f.conversionRepo.rows).toHaveLength(0);
  });

  it("never exports the click id in the CSV, but does export what converted", async () => {
    const { f, link } = await seed();
    const { clickRef } = await visit(f);
    await f.conversions.record({ ref: clickRef, value: "12.5", currency: "USD", ip: IP });
    const stream = await f.analytics.exportClicksCsv(users.alice, link.id, {
      range: "7d",
      includeBots: false,
    });
    const text = await new Response(stream).text();
    const [header, row] = text.split("\r\n");
    expect(header).toContain("converted,conversion_value,conversion_currency");
    expect(row).toMatch(/,true,12\.5,USD$/);
    expect(text).not.toContain(defined(clickRef));
  });
});
