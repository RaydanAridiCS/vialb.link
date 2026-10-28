import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { NewClick } from "@/server/domain/types";
import { DrizzleClickRepository } from "@/server/repositories/drizzle/click.repository.drizzle";
import { DrizzleConversionRepository } from "@/server/repositories/drizzle/conversion.repository.drizzle";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { connect, truncateAll } from "./helpers";

const { db, close } = connect();
const links = new DrizzleLinkRepository(db);
const clicks = new DrizzleClickRepository(db);
const conversions = new DrizzleConversionRepository(db);

afterAll(close);
beforeEach(() => truncateAll(db));

const at = (iso: string) => new Date(iso);

function click(linkId: string, occurredAt: string, extra: Partial<NewClick> = {}): NewClick {
  return {
    linkId,
    occurredAt: at(occurredAt),
    visitorHash: "v",
    country: "FR",
    region: null,
    city: null,
    browser: null,
    browserVersion: null,
    os: null,
    osVersion: null,
    deviceType: "desktop",
    referrerHost: null,
    referrerUrl: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    language: null,
    isBot: false,
    ...extra,
  };
}

async function setup() {
  const link = await links.create({
    code: "cv",
    destinationUrl: "https://a.example/",
    conversionsEnabled: true,
  });
  return link;
}

async function clickIdOf(ref: string) {
  const found = await conversions.findClickByRef(ref);
  if (!found) throw new Error("click not found");
  return found;
}

describe("click ids", () => {
  it("are unique among clicks that have one, and optional otherwise", async () => {
    const link = await setup();
    await clicks.record(click(link.id, "2026-03-02T10:00:00Z"));
    await clicks.record(click(link.id, "2026-03-02T10:01:00Z"));
    await clicks.record(click(link.id, "2026-03-02T10:02:00Z", { clickRef: "AAAAAAAAAAAAAAAA" }));
    await expect(
      clicks.record(click(link.id, "2026-03-02T10:03:00Z", { clickRef: "AAAAAAAAAAAAAAAA" })),
    ).rejects.toBeInstanceOf(Error);
    const found = await conversions.findClickByRef("AAAAAAAAAAAAAAAA");
    expect(found).toMatchObject({ linkId: link.id, isBot: false, conversionsEnabled: true });
    expect(await conversions.findClickByRef("BBBBBBBBBBBBBBBB")).toBeNull();
  });

  it("report whether the link still tracks conversions", async () => {
    const link = await setup();
    await clicks.record(click(link.id, "2026-03-02T10:00:00Z", { clickRef: "CCCCCCCCCCCCCCCC" }));
    await links.update(link.id, { conversionsEnabled: false });
    expect((await clickIdOf("CCCCCCCCCCCCCCCC")).conversionsEnabled).toBe(false);
  });
});

describe("conversions", () => {
  it("allows exactly one per click, even when reported concurrently", async () => {
    const link = await setup();
    await clicks.record(click(link.id, "2026-03-02T10:00:00Z", { clickRef: "DDDDDDDDDDDDDDDD" }));
    const { clickId } = await clickIdOf("DDDDDDDDDDDDDDDD");
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        conversions.insert({
          linkId: link.id,
          clickId,
          at: at("2026-03-02T11:00:00Z"),
          valueMinor: i,
          currency: "USD",
        }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const map = await conversions.forClicks([clickId]);
    expect(map.size).toBe(1);
  });

  it("disappear with their click and with their link", async () => {
    const link = await setup();
    await clicks.record(click(link.id, "2026-03-02T10:00:00Z", { clickRef: "EEEEEEEEEEEEEEEE" }));
    await clicks.record(click(link.id, "2026-03-20T10:00:00Z", { clickRef: "FFFFFFFFFFFFFFFF" }));
    for (const ref of ["EEEEEEEEEEEEEEEE", "FFFFFFFFFFFFFFFF"]) {
      const { clickId } = await clickIdOf(ref);
      await conversions.insert({
        linkId: link.id,
        clickId,
        at: at("2026-03-21T00:00:00Z"),
        valueMinor: 100,
        currency: "USD",
      });
    }
    // Retention removes the old click, and its conversion goes with it.
    await clicks.deleteOlderThan(at("2026-03-10T00:00:00Z"), 100);
    const { clickId: kept } = await clickIdOf("FFFFFFFFFFFFFFFF");
    expect((await conversions.forClicks([kept])).size).toBe(1);
    const summary = await conversions.summary({
      linkId: link.id,
      from: at("2026-03-01T00:00:00Z"),
      to: at("2026-04-01T00:00:00Z"),
      includeBots: false,
    });
    expect(summary).toMatchObject({ conversions: 1, eligibleClicks: 1 });
  });
});

describe("conversion summary (cohort by click time)", () => {
  it("counts tracked clicks as the denominator, groups value by currency, and honours bots", async () => {
    const link = await setup();
    const refs = [
      "R1AAAAAAAAAAAAAA",
      "R2AAAAAAAAAAAAAA",
      "R3AAAAAAAAAAAAAA",
      "R4AAAAAAAAAAAAAA",
      "R5AAAAAAAAAAAAAA",
    ];
    await clicks.record(click(link.id, "2026-03-02T10:00:00Z", { clickRef: refs[0] as string }));
    await clicks.record(
      click(link.id, "2026-03-02T11:00:00Z", {
        clickRef: refs[1] as string,
        country: "DE",
        routedBy: "variant:B",
      }),
    );
    await clicks.record(
      click(link.id, "2026-03-03T11:00:00Z", { clickRef: refs[2] as string, deviceType: "mobile" }),
    );
    await clicks.record(click(link.id, "2026-03-03T12:00:00Z", { clickRef: refs[3] as string, isBot: true }));
    await clicks.record(click(link.id, "2026-03-03T13:00:00Z")); // no id: not eligible
    await clicks.record(click(link.id, "2026-04-20T13:00:00Z", { clickRef: refs[4] as string })); // another period
    const convert = async (ref: string, valueMinor: number | null, currency: string | null) => {
      const { clickId } = await clickIdOf(ref);
      await conversions.insert({
        linkId: link.id,
        clickId,
        at: at("2026-05-01T00:00:00Z"),
        valueMinor,
        currency,
      });
    };
    await convert(refs[0] as string, 1000, "USD");
    await convert(refs[1] as string, 550, "EUR");
    await convert(refs[3] as string, 99, "USD"); // a bot
    await convert(refs[4] as string, 5, "USD"); // outside the range

    const filter = {
      linkId: link.id,
      from: at("2026-03-01T00:00:00Z"),
      to: at("2026-04-01T00:00:00Z"),
      includeBots: false,
    };
    expect(await conversions.summary(filter)).toEqual({
      conversions: 2,
      eligibleClicks: 3,
      values: [
        { currency: "EUR", totalMinor: 550, count: 1 },
        { currency: "USD", totalMinor: 1000, count: 1 },
      ],
    });
    const withBots = await conversions.summary({ ...filter, includeBots: true });
    expect(withBots).toMatchObject({ conversions: 3, eligibleClicks: 4 });

    expect(await conversions.breakdown(filter, "country", 10)).toEqual([
      { value: "FR", clicks: 2, conversions: 1 },
      { value: "DE", clicks: 1, conversions: 1 },
    ]);
    expect(await conversions.breakdown(filter, "routed_by", 10)).toEqual([
      { value: "Unknown", clicks: 2, conversions: 1 },
      { value: "variant:B", clicks: 1, conversions: 1 },
    ]);
    expect(await conversions.breakdown(filter, "device_type", 10)).toMatchObject([
      { value: "desktop", clicks: 2 },
      { value: "mobile", clicks: 1, conversions: 0 },
    ]);
  });

  it("is empty for a link with no tracked clicks", async () => {
    const link = await setup();
    expect(
      await conversions.summary({
        linkId: link.id,
        from: at("2026-03-01T00:00:00Z"),
        to: at("2026-04-01T00:00:00Z"),
        includeBots: false,
      }),
    ).toEqual({ conversions: 0, eligibleClicks: 0, values: [] });
  });
});
