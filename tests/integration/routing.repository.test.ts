import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { RoutingRule } from "@/lib/routing";
import type { NewClick } from "@/server/domain/types";
import { DrizzleClickRepository } from "@/server/repositories/drizzle/click.repository.drizzle";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { connect, createUser, truncateAll } from "./helpers";

const { db, close } = connect();
const links = new DrizzleLinkRepository(db);
const clicks = new DrizzleClickRepository(db);

afterAll(close);
beforeEach(() => truncateAll(db));

const rules: RoutingRule[] = [
  { platform: "ios", countries: ["FR", "DE"], url: "https://apps.apple.com/app/id1" },
  { platform: "android", url: "https://play.google.com/store/apps/details?id=app" },
  { countries: ["US"], url: "https://us.example/" },
];

function click(linkId: string, overrides: Partial<NewClick> = {}): NewClick {
  return {
    linkId,
    occurredAt: new Date("2026-03-02T10:15:00Z"),
    visitorHash: "v",
    country: "FR",
    region: null,
    city: null,
    browser: null,
    browserVersion: null,
    os: null,
    osVersion: null,
    deviceType: "mobile",
    referrerHost: null,
    referrerUrl: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    language: null,
    isBot: false,
    ...overrides,
  };
}

describe("links.routing_rules", () => {
  it("round-trips rules in order, with optional fields left out", async () => {
    const user = await createUser(db);
    const link = await links.create({
      code: "route",
      destinationUrl: "https://app.example/",
      userId: user.id,
      routingRules: rules,
    });
    expect(link.routingRules).toEqual(rules);
    expect((await links.findByCode("route"))?.routingRules).toEqual(rules);
    expect((await links.findById(link.id))?.routingRules[1]).toEqual({
      platform: "android",
      url: "https://play.google.com/store/apps/details?id=app",
    });
  });

  it("defaults to an empty list for plain links", async () => {
    const link = await links.create({ code: "plain", destinationUrl: "https://a.example/" });
    expect(link.routingRules).toEqual([]);
  });

  it("replaces and clears rules on update", async () => {
    const link = await links.create({
      code: "edit",
      destinationUrl: "https://a.example/",
      routingRules: rules,
    });
    const replaced = await links.update(link.id, { routingRules: [rules[2] as RoutingRule] });
    expect(replaced?.routingRules).toEqual([rules[2]]);
    const cleared = await links.update(link.id, { routingRules: [] });
    expect(cleared?.routingRules).toEqual([]);
  });

  it("keeps rules out of the way of the access-limit statement", async () => {
    const link = await links.create({
      code: "limit",
      destinationUrl: "https://a.example/",
      maxClicks: 1,
      routingRules: rules,
    });
    expect(await links.consumeAccess(link.id)).toBe("https://a.example/");
    expect(await links.consumeAccess(link.id)).toBeNull();
  });
});

describe("clicks.routed_by", () => {
  it("is stored with the click and counts as a dimension, with unrouted clicks as Unknown", async () => {
    const link = await links.create({
      code: "an",
      destinationUrl: "https://a.example/",
      routingRules: rules,
    });
    await clicks.record(click(link.id, { routedBy: "ios+country:FR" }));
    await clicks.record(click(link.id, { routedBy: "ios+country:FR", visitorHash: "v2" }));
    await clicks.record(click(link.id, { routedBy: "default", visitorHash: "v3" }));
    await clicks.record(click(link.id, { visitorHash: "v4" }));

    const filter = {
      linkId: link.id,
      from: new Date("2026-03-01T00:00:00Z"),
      to: new Date("2026-03-06T00:00:00Z"),
      includeBots: false,
    };
    expect(await clicks.topDimension(filter, "routed_by", 10)).toEqual([
      { value: "ios+country:FR", clicks: 2 },
      { value: "Unknown", clicks: 1 },
      { value: "default", clicks: 1 },
    ]);
    const recent = await clicks.recent(filter, 10);
    expect(recent.map((c) => c.routedBy ?? "none").sort()).toEqual([
      "default",
      "ios+country:FR",
      "ios+country:FR",
      "none",
    ]);
  });
});
