import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  apiCreateLinkSchema,
  apiUpdateLinkSchema,
  toCreateCommand,
  toUpdateCommand,
} from "@/features/links/api-schemas";
import { buildOpenApiDocument } from "@/features/links/openapi";
import { createLinkSchema, DEFAULT_LINK_FORM, qrOptionsSchema } from "@/features/links/schemas";
import {
  contrastRatio,
  DEFAULT_QR_ECC,
  DEFAULT_QR_FRAME_TEXT,
  frameLabel,
  isQrEcc,
  isQrFrame,
  isScannable,
  normalizeFrameText,
  QR_FRAME_TEXT_MAX,
  qrWarnings,
  relativeLuminance,
  type QrDesign,
} from "@/lib/qr-options";
import { composeQrSvg } from "@/lib/qr-svg";
import { ValidationError } from "@/server/errors";
import { qrOptionsFromQuery } from "@/server/http/qr-query";
import { buildFixture, users } from "../support/fixtures";

const design = (over: Partial<QrDesign> = {}): QrDesign => ({
  fg: "#000000",
  bg: "#FFFFFF",
  ecc: "M",
  frame: "none",
  frameText: null,
  ...over,
});

describe("normalizeFrameText", () => {
  it.each([
    ["  Scan   me  ", "Scan me"],
    ["Line\nbreak\tand\u0000control", "Line break and control"],
    ["", null],
    ["   ", null],
    [null, null],
    [undefined, null],
    ["x".repeat(40), "x".repeat(QR_FRAME_TEXT_MAX)],
    ["日本語のテキスト", "日本語のテキスト"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeFrameText(input)).toBe(expected);
  });

  it("never splits an emoji when cutting to the limit", () => {
    const text = normalizeFrameText("😀".repeat(30)) ?? "";
    expect(Array.from(text)).toHaveLength(QR_FRAME_TEXT_MAX);
    expect(text).toBe("😀".repeat(QR_FRAME_TEXT_MAX));
  });

  it("falls back to the default label", () => {
    expect(frameLabel(null)).toBe(DEFAULT_QR_FRAME_TEXT);
    expect(frameLabel("  ")).toBe(DEFAULT_QR_FRAME_TEXT);
    expect(frameLabel("Menu")).toBe("Menu");
  });

  it("recognises valid levels and frames", () => {
    expect(["L", "M", "Q", "H"].every(isQrEcc)).toBe(true);
    expect(isQrEcc("h")).toBe(false);
    expect(isQrEcc("X")).toBe(false);
    expect(isQrFrame("badge")).toBe(true);
    expect(isQrFrame("circle")).toBe(false);
    expect(DEFAULT_QR_ECC).toBe("H");
  });
});

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#123456", "#123456")).toBe(1);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 1);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#336699", "#EEDDCC")).toBeCloseTo(contrastRatio("#EEDDCC", "#336699"), 10);
  });

  it("accepts good pairs without warnings", () => {
    expect(qrWarnings("#000000", "#FFFFFF")).toEqual([]);
    expect(qrWarnings("#1A2B3C", "#F5F5F5")).toEqual([]);
  });

  it("warns about low contrast and blocks unreadable pairs", () => {
    expect(qrWarnings("#AAAAAA", "#FFFFFF")).toMatchObject([{ severity: "warn", code: "low-contrast" }]);
    expect(qrWarnings("#CCCCCC", "#FFFFFF")).toMatchObject([{ severity: "block", code: "low-contrast" }]);
    expect(qrWarnings("#808080", "#808080")).toMatchObject([{ severity: "block", code: "low-contrast" }]);
    expect(isScannable("#CCCCCC", "#FFFFFF")).toBe(false);
    expect(isScannable("#AAAAAA", "#FFFFFF")).toBe(true);
  });

  it("warns about inverted (light on dark) codes, even with strong contrast", () => {
    expect(qrWarnings("#FFFFFF", "#000000")).toEqual([
      expect.objectContaining({ severity: "warn", code: "inverted" }),
    ]);
    expect(qrWarnings("#F0F0F0", "#102030").map((w) => w.code)).toEqual(["inverted"]);
  });

  it("can report both problems at once", () => {
    const codes = qrWarnings("#B0B0B0", "#707070").map((w) => w.code);
    expect(codes).toEqual(["low-contrast", "inverted"]);
  });
});

/** Rebuilds the dark-module grid from the SVG path, so the drawing can be compared with the real matrix. */
function gridFromSvg(svg: string, size: number, margin = 2): boolean[][] {
  const grid = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const [, x, y, w] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(w); i++) {
      const row = grid[Number(y) - margin];
      if (row) row[Number(x) - margin + i] = true;
    }
  }
  return grid;
}

describe("composeQrSvg", () => {
  const text = "https://sho.rt/AbC1234";

  it("draws exactly the modules of the QR matrix", () => {
    for (const ecc of ["L", "M", "Q", "H"] as const) {
      const { modules } = QRCode.create(text, { errorCorrectionLevel: ecc });
      const grid = gridFromSvg(composeQrSvg(text, design({ ecc })), modules.size);
      for (let y = 0; y < modules.size; y++) {
        for (let x = 0; x < modules.size; x++) {
          expect(grid[y]?.[x], `${ecc} module ${x},${y}`).toBe(Boolean(modules.get(y, x)));
        }
      }
    }
  });

  it("is deterministic and well-formed", () => {
    const a = composeQrSvg(text, design({ fg: "#112233", bg: "#EEFFEE" }));
    expect(composeQrSvg(text, design({ fg: "#112233", bg: "#EEFFEE" }))).toBe(a);
    expect(a.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')).toBe(true);
    expect(a.endsWith("</svg>")).toBe(true);
    expect(a).toContain('fill="#112233"');
    expect(a).toContain('fill="#EEFFEE"');
    expect(a).not.toContain("<text");
  });

  it("makes higher error correction denser (more modules, larger viewBox)", () => {
    const side = (ecc: QrDesign["ecc"]) =>
      Number(/viewBox="0 0 (\d+)/.exec(composeQrSvg(text, design({ ecc })))?.[1]);
    expect(side("H")).toBeGreaterThanOrEqual(side("M"));
    expect(side("M")).toBeGreaterThanOrEqual(side("L"));
    expect(side("H")).toBeGreaterThan(side("L"));
  });

  it("adds a badge with the text, and taller canvas, for the badge frame", () => {
    const plain = composeQrSvg(text, design());
    const framed = composeQrSvg(text, design({ frame: "badge", frameText: "Menu" }));
    const height = (svg: string) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)?.[1]);
    const width = (svg: string) => Number(/viewBox="0 0 ([\d.]+) /.exec(svg)?.[1]);
    expect(framed).toContain(">Menu</text>");
    expect(width(framed)).toBe(width(plain));
    expect(height(framed)).toBeGreaterThan(height(plain));
  });

  it("uses the default text when the badge text is empty", () => {
    expect(composeQrSvg(text, design({ frame: "badge", frameText: null }))).toContain(">Scan me</text>");
    expect(composeQrSvg(text, design({ frame: "badge", frameText: "   " }))).toContain(">Scan me</text>");
  });

  it("escapes the badge text so it can never inject markup", () => {
    const svg = composeQrSvg(text, design({ frame: "badge", frameText: `<b onload="x()">&'` }));
    expect(svg).not.toContain("<b ");
    expect(svg).toContain("&lt;b onload=&quot;x()&quot;&gt;&amp;&apos;");
    // the only elements are the ones the composer writes
    expect([...svg.matchAll(/<([a-z]+)[ >/]/g)].map((m) => m[1])).toEqual([
      "svg",
      "rect",
      "path",
      "rect",
      "text",
    ]);
  });

  it("shrinks long badge text to stay inside the badge", () => {
    const size = (label: string) =>
      Number(
        /font-size="([\d.]+)"/.exec(composeQrSvg(text, design({ frame: "badge", frameText: label })))?.[1],
      );
    expect(size("W".repeat(QR_FRAME_TEXT_MAX))).toBeLessThan(size("Hi"));
  });

  it("only adds a pixel size when asked", () => {
    const rootTag = (svg: string) => /^<svg[^>]*>/.exec(svg)?.[0] ?? "";
    expect(rootTag(composeQrSvg(text, design()))).not.toMatch(/ width=| height=/);
    const sized = composeQrSvg(text, design({ frame: "badge" }), { pixelWidth: 800 });
    expect(rootTag(sized)).toMatch(/ width="800" height="\d+"/);
  });

  it("renders the same for the same options regardless of the text's case-sensitivity trap", () => {
    expect(composeQrSvg("https://sho.rt/aBc", design())).not.toBe(
      composeQrSvg("https://sho.rt/AbC", design()),
    );
  });
});

const pngSize = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};
const isPng = (bytes: Uint8Array) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;

describe("QrService", () => {
  const { qr } = buildFixture();
  const text = "https://sho.rt/AbC1234";

  it("renders SVG with each error correction level and rejects unknown ones", async () => {
    const sizes = new Set<string>();
    for (const ecc of ["L", "M", "Q", "H"]) {
      const svg = String((await qr.render(text, "svg", { ecc })).body);
      sizes.add(/viewBox="0 0 (\d+)/.exec(svg)?.[1] ?? "");
    }
    expect(sizes.size).toBeGreaterThan(1);
    await expect(qr.render(text, "svg", { ecc: "Z" })).rejects.toBeInstanceOf(ValidationError);
    await expect(qr.render(text, "png", { ecc: "m" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an unknown frame and keeps validating colours", async () => {
    await expect(qr.render(text, "svg", { frame: "circle" })).rejects.toBeInstanceOf(ValidationError);
    await expect(qr.render(text, "svg", { fg: "red" })).rejects.toBeInstanceOf(ValidationError);
    await expect(qr.render(text, "png", { bg: "#FFF" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("defaults to M, no frame and black on white, like links did before QR options existed", async () => {
    const image = await qr.render(text, "svg");
    expect(image.contentType).toBe("image/svg+xml; charset=utf-8");
    expect(String(image.body)).toBe(composeQrSvg(text, design()));
  });

  const pngWidth = async (size: number | undefined, frame?: string) => {
    const image = await qr.render(text, "png", { size, frame });
    expect(isPng(image.body as Uint8Array)).toBe(true);
    expect(image.contentType).toBe("image/png");
    return pngSize(image.body as Uint8Array).width;
  };

  it("renders plain PNGs near the requested size (qrcode scales in whole modules)", async () => {
    const width = await pngWidth(1024);
    expect(width).toBeLessThanOrEqual(1024);
    expect(width).toBeGreaterThan(900);
  });

  it("clamps plain PNG sizes to 128-2048 and ignores NaN", { timeout: 30_000 }, async () => {
    expect(await pngWidth(1)).toBeLessThanOrEqual(128);
    expect(await pngWidth(99999)).toBeLessThanOrEqual(2048);
    expect(await pngWidth(Number.NaN)).toBeLessThanOrEqual(512);
  });

  it("rasterises framed PNGs at the exact size, clamped to 128-2048", { timeout: 30_000 }, async () => {
    expect(await pngWidth(800, "badge")).toBe(800);
    expect(await pngWidth(1, "badge")).toBe(128);
    expect(await pngWidth(99999, "badge")).toBe(2048);
  });

  it(
    "rasterises a framed PNG taller than wide, with the badge and its text drawn",
    { timeout: 30_000 },
    async () => {
      const fg = "#0F4C3A";
      const bg = "#FFFFFF";
      const image = await qr.render(text, "png", { size: 600, frame: "badge", frameText: "Scan me", fg, bg });
      const png = image.body as Uint8Array;
      const { width, height } = pngSize(png);
      expect(width).toBe(600);
      expect(height).toBeGreaterThan(width);

      const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const at = (x: number, y: number) => {
        const i = (y * info.width + x) * 3;
        return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0] as const;
      };
      const [r, g, b] = at(Math.round(info.width * 0.12), Math.round(info.height * 0.935 - 12));
      // somewhere in the badge (left of the text) the pixel is the foreground colour
      expect([r, g, b]).toEqual([0x0f, 0x4c, 0x3a]);

      // the text is drawn in the background colour on top of the badge
      let textPixels = 0;
      const top = Math.round(info.height * 0.87);
      const bottom = Math.round(info.height * 0.97);
      for (let y = top; y < bottom; y++) {
        for (let x = Math.round(info.width * 0.3); x < Math.round(info.width * 0.7); x++) {
          const [pr, pg, pb] = at(x, y);
          if (pr > 200 && pg > 200 && pb > 200) textPixels += 1;
        }
      }
      expect(textPixels, "badge text should be visible (is a system font installed?)").toBeGreaterThan(50);
    },
  );

  it("a framed code at the same size is bigger than the unframed code's height", async () => {
    const plain = pngSize((await qr.render(text, "png", { size: 512, frame: "none" })).body as Uint8Array);
    const framed = pngSize((await qr.render(text, "png", { size: 512, frame: "badge" })).body as Uint8Array);
    expect(framed.height).toBeGreaterThan(plain.height);
  });
});

describe("QrService for links", () => {
  async function setup() {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      {
        destinationUrl: "https://example.com",
        customCode: "my-code",
        qrFgColor: "#112233",
        qrBgColor: "#FFEEDD",
        qrEcc: "Q",
        qrFrame: "badge",
        qrFrameText: "Menu",
      },
      { ip: null },
    );
    return { f, link };
  }

  it("renders a link's saved design", async () => {
    const { f, link } = await setup();
    const svg = String((await f.qr.forOwnedLink(users.alice, link.id, "svg")).body);
    expect(svg).toBe(
      composeQrSvg(
        "https://sho.rt/my-code",
        design({ fg: "#112233", bg: "#FFEEDD", ecc: "Q", frame: "badge", frameText: "Menu" }),
      ),
    );
  });

  it("lets query overrides win over the saved design, field by field", async () => {
    const { f, link } = await setup();
    const svg = String(
      (
        await f.qr.forOwnedLink(users.alice, link.id, "svg", {
          frame: "none",
          frameText: "Ignored",
          ecc: "L",
        })
      ).body,
    );
    expect(svg).not.toContain("<text");
    expect(svg).toContain('fill="#112233"');
    expect(svg).toBe(
      composeQrSvg(
        "https://sho.rt/my-code",
        design({ fg: "#112233", bg: "#FFEEDD", ecc: "L", frame: "none" }),
      ),
    );
  });

  it("only renders links the actor may manage", async () => {
    const { f, link } = await setup();
    await expect(f.qr.forOwnedLink(users.bob, link.id, "svg")).rejects.toThrow(/access/);
    await expect(f.qr.forOwnedLink(users.admin, link.id, "svg")).resolves.toBeDefined();
  });

  it("serves the saved design on the public endpoint, only for enabled links", async () => {
    const { f, link } = await setup();
    const image = await f.qr.forPublicCode("my-code", "svg");
    expect(String(image?.body)).toContain(">Menu</text>");
    expect(await f.qr.forPublicCode("nope", "svg")).toBeNull();
    await f.links.setEnabled(users.alice, [link.id], false);
    expect(await f.qr.forPublicCode("my-code", "svg")).toBeNull();
  });

  it("renders links created before QR options existed exactly as they were (M, no frame)", async () => {
    const f = buildFixture();
    const legacy = await f.linkRepo.create({
      code: "legacy1",
      destinationUrl: "https://old.example",
      userId: "alice",
    });
    expect(legacy).toMatchObject({ qrEcc: "M", qrFrame: "none", qrFrameText: null });
    const svg = String((await f.qr.forPublicCode("legacy1", "svg"))?.body);
    expect(svg).toBe(composeQrSvg("https://sho.rt/legacy1", design()));
  });
});

describe("LinkService QR options", () => {
  const base = { destinationUrl: "https://example.com" };

  it("creates links with H correction, no frame and the default colours", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(users.alice, base, { ip: null });
    expect(link).toMatchObject({
      qrEcc: "H",
      qrFrame: "none",
      qrFrameText: null,
      qrFgColor: "#000000",
      qrBgColor: "#FFFFFF",
    });
  });

  it("stores the chosen options, normalizing the badge text", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { ...base, qrEcc: "L", qrFrame: "badge", qrFrameText: "  Visit   us\n" },
      { ip: null },
    );
    expect(link).toMatchObject({ qrEcc: "L", qrFrame: "badge", qrFrameText: "Visit us" });
  });

  it("treats empty badge text as 'use the default'", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { ...base, qrFrame: "badge", qrFrameText: "  " },
      { ip: null },
    );
    expect(link.qrFrameText).toBeNull();
  });

  it("rejects values the schema would have caught, when called directly", async () => {
    const f = buildFixture();
    const bad = (over: object) => f.links.create(users.alice, { ...base, ...over } as never, { ip: null });
    await expect(bad({ qrEcc: "X" })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ qrFrame: "star" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses colours no scanner can read, but accepts weak and inverted ones (UI warns)", async () => {
    const f = buildFixture();
    await expect(
      f.links.create(users.alice, { ...base, qrFgColor: "#CCCCCC", qrBgColor: "#FFFFFF" }, { ip: null }),
    ).rejects.toThrow(/too similar/);
    await expect(
      f.links.create(users.alice, { ...base, qrFgColor: "#FFFFFF", qrBgColor: "#000000" }, { ip: null }),
    ).resolves.toBeDefined();
    await expect(
      f.links.create(users.alice, { ...base, qrFgColor: "#AAAAAA", qrBgColor: "#FFFFFF" }, { ip: null }),
    ).resolves.toBeDefined();
  });

  it("updates one option without touching the others", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { ...base, qrFgColor: "#112233", qrFrame: "badge", qrFrameText: "Menu" },
      { ip: null },
    );

    const updated = await f.links.update(users.alice, link.id, { qrEcc: "Q" });

    expect(updated).toMatchObject({
      qrEcc: "Q",
      qrFgColor: "#112233",
      qrFrame: "badge",
      qrFrameText: "Menu",
    });
  });

  it("clears the badge text with null or empty text", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { ...base, qrFrame: "badge", qrFrameText: "Menu" },
      { ip: null },
    );
    expect((await f.links.update(users.alice, link.id, { qrFrameText: null })).qrFrameText).toBeNull();
    await f.links.update(users.alice, link.id, { qrFrameText: "Again" });
    expect((await f.links.update(users.alice, link.id, { qrFrameText: "" })).qrFrameText).toBeNull();
  });

  it("checks a changed colour against the saved other colour", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(users.alice, base, { ip: null }); // black on white
    await expect(f.links.update(users.alice, link.id, { qrFgColor: "#EEEEEE" })).rejects.toThrow(
      /too similar/,
    );
    await expect(f.links.update(users.alice, link.id, { qrBgColor: "#111111" })).rejects.toThrow(
      /too similar/,
    );
    expect((await f.links.update(users.alice, link.id, { qrFgColor: "#222222" })).qrFgColor).toBe("#222222");
  });

  it("leaves a legacy low-contrast link editable as long as its colours are not touched", async () => {
    const f = buildFixture();
    const legacy = await f.linkRepo.create({
      code: "oldlow",
      destinationUrl: "https://old.example",
      userId: "alice",
      qrFgColor: "#CCCCCC",
      qrBgColor: "#FFFFFF",
    });
    const updated = await f.links.update(users.alice, legacy.id, { title: "Still editable" });
    expect(updated.title).toBe("Still editable");
  });

  it("gives imported links the same QR defaults as the form", async () => {
    const f = buildFixture();
    await f.links.importLinks(users.alice, [{ row: 2, destinationUrl: "https://a.example" }]);
    const [stored] = [...f.linkRepo.rows.values()];
    expect(stored).toMatchObject({ qrEcc: "H", qrFrame: "none", qrFrameText: null });
  });
});

describe("QR schemas and API", () => {
  const valid = { ...DEFAULT_LINK_FORM, destinationUrl: "https://example.com" };

  it("form: accepts the options and enforces limits", () => {
    expect(
      createLinkSchema.safeParse({ ...valid, qrEcc: "Q", qrFrame: "badge", qrFrameText: "Menu" }).success,
    ).toBe(true);
    expect(createLinkSchema.safeParse({ ...valid, qrEcc: "Z" }).success).toBe(false);
    expect(createLinkSchema.safeParse({ ...valid, qrFrame: "round" }).success).toBe(false);
    expect(
      createLinkSchema.safeParse({ ...valid, qrFrameText: "x".repeat(QR_FRAME_TEXT_MAX + 1) }).success,
    ).toBe(false);
    expect(createLinkSchema.safeParse({ ...valid, qrFrameText: "x".repeat(QR_FRAME_TEXT_MAX) }).success).toBe(
      true,
    );
  });

  it("form: refuses unscannable colours on the foreground field, accepts inverted ones", () => {
    const result = createLinkSchema.safeParse({ ...valid, qrFgColor: "#DDDDDD" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["qrFgColor"]);
    expect(createLinkSchema.safeParse({ ...valid, qrFgColor: "#FFFFFF", qrBgColor: "#000000" }).success).toBe(
      true,
    );
  });

  it("save action schema carries every option and the same colour rule", () => {
    const input = {
      id: "0190d8a6-7a8e-7c3e-8f33-0f6a2f4a9d11",
      qrFgColor: "#000000",
      qrBgColor: "#FFFFFF",
      qrEcc: "H",
      qrFrame: "none",
      qrFrameText: "",
    };
    expect(qrOptionsSchema.safeParse(input).success).toBe(true);
    expect(qrOptionsSchema.safeParse({ ...input, qrFgColor: "#EEEEEE" }).success).toBe(false);
    expect(qrOptionsSchema.safeParse({ ...input, qrEcc: undefined }).success).toBe(false);
  });

  it("API: create/update accept and map the QR options", () => {
    const create = apiCreateLinkSchema.parse({
      url: "https://example.com",
      qrEcc: "Q",
      qrFrame: "badge",
      qrFrameText: "Menu",
    });
    expect(toCreateCommand(create)).toMatchObject({ qrEcc: "Q", qrFrame: "badge", qrFrameText: "Menu" });
    expect(toCreateCommand(apiCreateLinkSchema.parse({ url: "https://example.com" }))).toMatchObject({
      qrEcc: undefined,
      qrFrame: undefined,
    });

    const update = apiUpdateLinkSchema.parse({ qrFrameText: null, qrEcc: "L" });
    expect(toUpdateCommand(update)).toMatchObject({ qrFrameText: null, qrEcc: "L" });
    expect(apiCreateLinkSchema.safeParse({ url: "https://example.com", qrEcc: "X" }).success).toBe(false);
    expect(
      apiCreateLinkSchema.safeParse({ url: "https://example.com", qrFrameText: "x".repeat(25) }).success,
    ).toBe(false);
  });

  it("OpenAPI documents the new request fields, response fields and QR query parameters", () => {
    const doc = buildOpenApiDocument("https://sho.rt") as unknown as {
      paths: Record<string, { get: { parameters: { name: string }[] } }>;
      components: { schemas: Record<string, { properties: Record<string, unknown> }> };
    };
    for (const path of ["/api/v1/links/{id}/qr.png", "/api/v1/links/{id}/qr.svg"]) {
      const names = doc.paths[path]?.get.parameters.map((p) => p.name);
      expect(names, path).toEqual(expect.arrayContaining(["fg", "bg", "ecc", "frame", "frameText"]));
    }
    for (const name of ["CreateLinkRequest", "UpdateLinkRequest", "Link"]) {
      expect(Object.keys(doc.components.schemas[name]?.properties ?? {}), name).toEqual(
        expect.arrayContaining(["qrEcc", "qrFrame", "qrFrameText"]),
      );
    }
  });
});

describe("qrOptionsFromQuery", () => {
  it("reads every design override and leaves the rest undefined", () => {
    const options = qrOptionsFromQuery(
      new URLSearchParams("fg=%23112233&bg=%23FFFFFF&size=640&ecc=Q&frame=badge&frameText=Scan%20me%20now"),
    );
    expect(options).toEqual({
      fg: "#112233",
      bg: "#FFFFFF",
      size: 640,
      ecc: "Q",
      frame: "badge",
      frameText: "Scan me now",
    });
    expect(qrOptionsFromQuery(new URLSearchParams(""))).toEqual({
      fg: undefined,
      bg: undefined,
      size: undefined,
      ecc: undefined,
      frame: undefined,
      frameText: undefined,
    });
  });

  it("uses the route's default size only when none is given", () => {
    expect(qrOptionsFromQuery(new URLSearchParams(""), 1024).size).toBe(1024);
    expect(qrOptionsFromQuery(new URLSearchParams("size=300"), 1024).size).toBe(300);
  });

  it("passes junk through for the service to reject", async () => {
    const options = qrOptionsFromQuery(new URLSearchParams("ecc=Z&size=abc"));
    expect(options).toMatchObject({ ecc: "Z" });
    expect(Number.isNaN(options.size)).toBe(true);
    await expect(buildFixture().qr.render("x", "svg", options)).rejects.toBeInstanceOf(ValidationError);
  });
});
