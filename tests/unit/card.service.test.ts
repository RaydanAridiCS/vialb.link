import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cardVersion, CARD_HEIGHT, CARD_WIDTH, type CardDesign } from "@/lib/social-card";
import { ValidationError } from "@/server/errors";
import { buildFixture, SITE_URL, users } from "../support/fixtures";

const SLACKBOT = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";
const BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const design: CardDesign = {
  template: "gradient",
  palette: "forest",
  headline: "Spring sale starts Friday",
  subline: "Up to 40% off",
  showHost: true,
};

async function setup(over: Partial<CardDesign> | null = {}, extra: Parameters<typeof makeLink>[1] = {}) {
  const f = buildFixture();
  const link = await makeLink(f, extra, over === null ? null : { ...design, ...over });
  return { f, link };
}

async function makeLink(
  f: ReturnType<typeof buildFixture>,
  extra: { password?: string; ogImageUrl?: string; expiration?: "1h"; maxClicks?: number } = {},
  cardDesign: CardDesign | null = design,
) {
  const { link } = await f.links.create(
    users.alice,
    {
      destinationUrl: "https://shop.example/private/path",
      cardDesign,
      ...(extra.password ? { password: extra.password } : {}),
      ...(extra.ogImageUrl ? { ogImageUrl: extra.ogImageUrl } : {}),
      ...(extra.expiration ? { expiration: { preset: extra.expiration } } : {}),
      ...(extra.maxClicks ? { maxClicks: extra.maxClicks } : {}),
    },
    { ip: null },
  );
  return link;
}

describe("CardService", () => {
  it("renders a 1200x630 PNG for a link with a card", async () => {
    const { f, link } = await setup();
    const image = await f.card.forCode(link.code);
    expect(image).not.toBeNull();
    expect(image?.contentType).toBe("image/png");
    expect(image?.filename).toBe(`${link.code}-card.png`);
    const meta = await sharp(image?.body).metadata();
    expect(meta).toMatchObject({ format: "png", width: CARD_WIDTH, height: CARD_HEIGHT });
  });

  it("really draws the card: the background takes the palette colour and the text leaves marks", async () => {
    const { f, link } = await setup({ template: "plain", palette: "ink", headline: "Hello" });
    const image = await f.card.forCode(link.code);
    const { data, info } = await sharp(image?.body).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [
      ...data.subarray((y * info.width + x) * info.channels).slice(0, 3),
    ];
    // Ink palette: #14110F background, away from the accent bar and the text.
    expect(pixel(1100, 40)).toEqual([0x14, 0x11, 0x0f]);
    // Some pixel in the text area is the light foreground colour.
    let light = 0;
    for (let y = 100; y < 300; y++) {
      for (let x = 130; x < 700; x++) {
        const [r = 0] = pixel(x, y);
        if (r > 0xc0) light++;
      }
    }
    expect(light).toBeGreaterThan(500);
  });

  it("gives different images for different designs, and the same one for the same design", async () => {
    const { f, link } = await setup();
    const first = await f.card.forCode(link.code);
    const again = await f.card.forCode(link.code);
    expect(again?.body).toBe(first?.body);

    await f.links.update(users.alice, link.id, { cardDesign: { ...design, headline: "Autumn sale" } });
    const changed = await f.card.forCode(link.code);
    expect(changed?.body).not.toBe(first?.body);
    expect(Buffer.from(changed?.body ?? []).equals(Buffer.from(first?.body ?? []))).toBe(false);
  });

  it("serves nothing for unknown codes and for links without a card", async () => {
    const { f, link } = await setup(null);
    expect(await f.card.forCode(link.code)).toBeNull();
    expect(await f.card.forCode("nope")).toBeNull();
  });

  it("serves nothing once the link is disabled, deleted, expired or used up", async () => {
    const { f, link } = await setup();
    expect(await f.card.forCode(link.code)).not.toBeNull();
    await f.links.update(users.alice, link.id, { isEnabled: false });
    expect(await f.card.forCode(link.code)).toBeNull();
    await f.links.update(users.alice, link.id, { isEnabled: true });
    expect(await f.card.forCode(link.code)).not.toBeNull();
    await f.links.delete(users.alice, [link.id]);
    expect(await f.card.forCode(link.code)).toBeNull();

    const expiring = await setup({}, { expiration: "1h" });
    f.clock.advance(0);
    expiring.f.clock.advance(2 * 3_600_000);
    expect(await expiring.f.card.forCode(expiring.link.code)).toBeNull();

    const limited = await setup({}, { maxClicks: 1 });
    await limited.f.redirect.resolve({
      code: limited.link.code,
      userAgent: BROWSER,
      searchParams: new URLSearchParams(),
    });
    expect(await limited.f.card.forCode(limited.link.code)).toBeNull();
  });

  it("never draws from a corrupt stored design", async () => {
    const { f, link } = await setup();
    const row = f.linkRepo.rows.get(link.id);
    if (row) row.cardDesign = { ...design, palette: "orange" as unknown as "ink" };
    expect(await f.card.forCode(link.code)).toBeNull();
  });
});

describe("saving a card", () => {
  it("stores a normalized design and returns it", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      {
        destinationUrl: "https://a.example",
        cardDesign: { ...design, headline: "  Padded  ", subline: " sub " },
      },
      { ip: null },
    );
    expect(link.cardDesign).toEqual({ ...design, headline: "Padded", subline: "sub" });
  });

  it("defaults to no card", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(users.alice, { destinationUrl: "https://a.example" }, { ip: null });
    expect(link.cardDesign).toBeNull();
  });

  it.each([
    ["no headline", { ...design, headline: "  " }],
    ["a long headline", { ...design, headline: "x".repeat(81) }],
    ["a long subtitle", { ...design, subline: "x".repeat(101) }],
    ["an unknown template", { ...design, template: "fancy" as unknown as "plain" }],
    ["an unknown palette", { ...design, palette: "orange" as unknown as "ink" }],
  ])("rejects %s", async (_name, bad) => {
    const f = buildFixture();
    await expect(
      f.links.create(users.alice, { destinationUrl: "https://a.example", cardDesign: bad }, { ip: null }),
    ).rejects.toMatchObject({ constructor: ValidationError, details: { field: "cardDesign" } });
  });

  it("keeps, replaces and removes the card on update", async () => {
    const f = buildFixture();
    const link = await makeLink(f);
    expect((await f.links.update(users.alice, link.id, { title: "Renamed" })).cardDesign).toEqual(design);
    expect(
      (await f.links.update(users.alice, link.id, { cardDesign: { ...design, template: "split" } }))
        .cardDesign?.template,
    ).toBe("split");
    expect((await f.links.update(users.alice, link.id, { cardDesign: null })).cardDesign).toBeNull();
  });

  it("does not let someone else change it", async () => {
    const f = buildFixture();
    const link = await makeLink(f);
    await expect(f.links.update(users.bob, link.id, { cardDesign: null })).rejects.toThrow();
    expect((await f.links.get(users.alice, link.id)).cardDesign).toEqual(design);
  });
});

describe("link previews for crawlers", () => {
  const preview = async (f: ReturnType<typeof buildFixture>, code: string) => {
    const decision = await f.redirect.resolve({
      code,
      userAgent: SLACKBOT,
      searchParams: new URLSearchParams(),
    });
    expect(decision.kind).toBe("preview");
    return decision.kind === "preview" ? decision.html : "";
  };

  it("points og:image and twitter:image at the card, with its size and a description", async () => {
    const { f, link } = await setup();
    const html = await preview(f, link.code);
    const url = `${SITE_URL}/${link.code}/card?v=${cardVersion(design)}`;
    expect(html).toContain(`<meta property="og:image" content="${url}">`);
    expect(html).toContain(`<meta name="twitter:image" content="${url}">`);
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<meta property="og:image:alt" content="Spring sale starts Friday">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it("changes the image URL when the design changes", async () => {
    const { f, link } = await setup();
    const before = await preview(f, link.code);
    await f.links.update(users.alice, link.id, { cardDesign: { ...design, headline: "Autumn sale" } });
    const after = await preview(f, link.code);
    expect(after).not.toBe(before);
    expect(/og:image" content="([^"]+)"/.exec(after)?.[1]).not.toBe(
      /og:image" content="([^"]+)"/.exec(before)?.[1],
    );
  });

  it("lets an image link set by the owner win over the card", async () => {
    const { f, link } = await setup({}, { ogImageUrl: "https://img.example/cover.png" });
    const html = await preview(f, link.code);
    expect(html).toContain('content="https://img.example/cover.png"');
    expect(html).not.toContain("/card");
    expect(html).not.toContain("og:image:width");
  });

  it("has no image tags and a plain summary card for links without either", async () => {
    const { f, link } = await setup(null);
    const html = await preview(f, link.code);
    expect(html).not.toContain("og:image");
    expect(html).toContain('<meta name="twitter:card" content="summary">');
  });

  it("escapes the card's headline in the alt text", async () => {
    const { f, link } = await setup({ headline: `"><script>alert(1)</script>` });
    const html = await preview(f, link.code);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("does not leak the destination of a protected link through the card", async () => {
    const { f, link } = await setup({}, { password: "open-sesame" });
    const html = await preview(f, link.code);
    expect(html).toContain("/card?v=");
    expect(html).not.toContain("shop.example");
  });
});
