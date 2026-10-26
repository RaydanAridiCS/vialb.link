import { describe, expect, it } from "vitest";
import type { LinkPixels } from "@/lib/pixels";
import { ValidationError } from "@/server/errors";
import { buildFixture, users, type FixtureOptions } from "../support/fixtures";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const SLACKBOT = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";
const WEBSITE = "https://news.example/story";
const PIXELS: LinkPixels = { meta: "123456789012345", google: "G-ABCD1234" };

async function setup(options: FixtureOptions = { pixelsEnabled: true }, pixels: LinkPixels | null = PIXELS) {
  const f = buildFixture(options);
  const { link } = await f.links.create(
    users.alice,
    { destinationUrl: WEBSITE, ...(pixels ? { pixels } : {}) },
    { ip: null },
  );
  const visit = (headers: Record<string, string> = {}, userAgent: string | null = IPHONE, query = "") =>
    f.redirect.resolve({
      code: link.code,
      userAgent,
      searchParams: new URLSearchParams(query),
      ip: "203.0.113.9",
      headers: new Headers(headers),
    });
  return { f, link, visit };
}

describe("retargeting pixels on the redirect path", () => {
  it("sends a visitor with no recorded choice to the page that asks", async () => {
    const { visit, link } = await setup();
    expect(await visit()).toEqual({
      kind: "pixel",
      linkId: link.id,
      destination: WEBSITE,
      routedBy: null,
      pixels: PIXELS,
      consent: "ask",
    });
  });

  it("skips the question for a visitor who already agreed", async () => {
    const { visit } = await setup();
    expect(await visit({ cookie: "vialb_consent=granted" })).toMatchObject({
      kind: "pixel",
      consent: "granted",
    });
  });

  it("redirects straight away for a visitor who already said no", async () => {
    const { visit } = await setup();
    expect(await visit({ cookie: "vialb_consent=denied" })).toMatchObject({
      kind: "redirect",
      destination: WEBSITE,
    });
  });

  it("redirects straight away on Global Privacy Control or Do Not Track, even after an earlier yes", async () => {
    const { visit } = await setup();
    expect((await visit({ "sec-gpc": "1" })).kind).toBe("redirect");
    expect((await visit({ dnt: "1" })).kind).toBe("redirect");
    expect((await visit({ "sec-gpc": "1", cookie: "vialb_consent=granted" })).kind).toBe("redirect");
  });

  it("redirects normally while the instance has pixels switched off", async () => {
    const { visit } = await setup({ pixelsEnabled: false });
    expect((await visit()).kind).toBe("redirect");
  });

  it("follows an admin switching pixels on and off", async () => {
    const { f, visit } = await setup({ pixelsEnabled: false });
    await f.settings.update(users.admin, { pixelsEnabled: true });
    expect((await visit()).kind).toBe("pixel");
    await f.settings.update(users.admin, { pixelsEnabled: null });
    expect((await visit()).kind).toBe("redirect");
  });

  it("redirects links without pixels", async () => {
    const { visit } = await setup({ pixelsEnabled: true }, null);
    expect((await visit()).kind).toBe("redirect");
  });

  it("gives link-preview bots the preview, never the pixel page", async () => {
    const { visit } = await setup();
    expect((await visit({}, SLACKBOT)).kind).toBe("preview");
  });

  it("forwards the query string and uses the smart-routing target", async () => {
    const f = buildFixture({ pixelsEnabled: true });
    const { link } = await f.links.create(
      users.alice,
      {
        destinationUrl: WEBSITE,
        pixels: PIXELS,
        routingRules: [{ platform: "ios", url: "https://apps.apple.com/app/id1" }],
      },
      { ip: null },
    );
    const decision = await f.redirect.resolve({
      code: link.code,
      userAgent: IPHONE,
      searchParams: new URLSearchParams("utm_source=ad"),
      headers: new Headers(),
    });
    expect(decision).toMatchObject({
      kind: "pixel",
      destination: "https://apps.apple.com/app/id1?utm_source=ad",
      routedBy: "ios",
    });
  });

  it("uses up one access per visit, like a plain redirect", async () => {
    const f = buildFixture({ pixelsEnabled: true });
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, pixels: PIXELS, maxClicks: 1 },
      { ip: null },
    );
    const request = {
      code: link.code,
      userAgent: IPHONE,
      searchParams: new URLSearchParams(),
      headers: new Headers(),
    };
    expect((await f.redirect.resolve(request)).kind).toBe("pixel");
    expect(await f.redirect.resolve(request)).toEqual({ kind: "gone", reason: "limit" });
  });
});

describe("saving pixels", () => {
  it("normalizes and returns them on the link", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, pixels: { meta: " 123456789 ", google: "gtm-abc123" } },
      { ip: null },
    );
    expect(link.pixels).toEqual({ meta: "123456789", google: "GTM-ABC123" });
  });

  it("stores no pixels when every field is empty", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, pixels: { meta: "", google: "" } },
      { ip: null },
    );
    expect(link.pixels).toBeNull();
  });

  it("rejects an ID that is not one", async () => {
    const f = buildFixture();
    await expect(
      f.links.create(
        users.alice,
        { destinationUrl: WEBSITE, pixels: { meta: '1"};alert(1)//' } },
        { ip: null },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      f.links.create(users.alice, { destinationUrl: WEBSITE, pixels: { google: "UA-123" } }, { ip: null }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("keeps pixels when an edit leaves them out, replaces them, and removes them with null", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, pixels: PIXELS },
      { ip: null },
    );
    expect((await f.links.update(users.alice, link.id, { title: "x" })).pixels).toEqual(PIXELS);
    expect((await f.links.update(users.alice, link.id, { pixels: { meta: "987654321" } })).pixels).toEqual({
      meta: "987654321",
    });
    expect((await f.links.update(users.alice, link.id, { pixels: null })).pixels).toBeNull();
  });

  it("does not let one user change another's pixels", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, pixels: PIXELS },
      { ip: null },
    );
    await expect(f.links.update(users.bob, link.id, { pixels: null })).rejects.toBeDefined();
  });
});

describe("pixels and passwords exclude each other", () => {
  it("rejects a new link that has both", async () => {
    const f = buildFixture();
    await expect(
      f.links.create(
        users.alice,
        { destinationUrl: WEBSITE, pixels: PIXELS, password: "secret-pass" },
        { ip: null },
      ),
    ).rejects.toThrow(/password/);
  });

  it("rejects adding a password to a link with pixels, and pixels to a protected link", async () => {
    const f = buildFixture();
    const withPixels = (
      await f.links.create(users.alice, { destinationUrl: WEBSITE, pixels: PIXELS }, { ip: null })
    ).link;
    await expect(f.links.update(users.alice, withPixels.id, { password: "secret-pass" })).rejects.toThrow(
      /pixels/,
    );

    const protectedLink = (
      await f.links.create(users.alice, { destinationUrl: WEBSITE, password: "secret-pass" }, { ip: null })
    ).link;
    await expect(f.links.update(users.alice, protectedLink.id, { pixels: PIXELS })).rejects.toThrow(
      /password/,
    );
  });

  it("allows swapping them in a single edit", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: WEBSITE, pixels: PIXELS },
      { ip: null },
    );
    const updated = await f.links.update(users.alice, link.id, { pixels: null, password: "secret-pass" });
    expect(updated.pixels).toBeNull();
    expect(updated.hasPassword).toBe(true);
    const back = await f.links.update(users.alice, link.id, { password: null, pixels: PIXELS });
    expect(back.pixels).toEqual(PIXELS);
    expect(back.hasPassword).toBe(false);
  });
});
