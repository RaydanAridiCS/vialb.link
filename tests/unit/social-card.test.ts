import { describe, expect, it } from "vitest";
import { textWidth } from "@/lib/font-metrics";
import { PALETTE_KEYS, PALETTES } from "@/lib/palettes";
import { contrastRatio } from "@/lib/qr-options";
import {
  backgroundEdges,
  CARD_HEADLINE_MAX,
  CARD_HEIGHT,
  CARD_SUBLINE_MAX,
  CARD_TEMPLATES,
  CARD_WIDTH,
  composeCardSvg,
  escapeXml,
  fitText,
  mixHex,
  parseCardDesign,
  wrapLines,
  type CardDesign,
} from "@/lib/social-card";

const design = (over: Partial<CardDesign> = {}): CardDesign => ({
  template: "gradient",
  palette: "forest",
  headline: "Spring sale starts Friday",
  subline: "Up to 40% off everything in the shop",
  showHost: true,
  ...over,
});

// Digits are all the same width in DejaVu Sans, which makes line lengths easy to reason about.
const digitsWidth = (chars: number, size = 10, bold = false) => textWidth("0".repeat(chars), size, bold);

describe("textWidth", () => {
  it("measures real glyph widths: bold is wider than regular, and a W is much wider than an i", () => {
    expect(textWidth("W", 100, true)).toBeCloseTo(110.3, 0);
    expect(textWidth("i", 100)).toBeCloseTo(27.8, 0);
    expect(textWidth("W", 100, true)).toBeGreaterThan(textWidth("W", 100, false));
    expect(textWidth("WWWW", 10)).toBeGreaterThan(textWidth("iiii", 10) * 3);
  });

  it("scales with the font size and adds up", () => {
    expect(textWidth("ab", 20)).toBeCloseTo(2 * textWidth("ab", 10));
    expect(textWidth("ab", 10)).toBeCloseTo(textWidth("a", 10) + textWidth("b", 10));
    expect(textWidth("", 50)).toBe(0);
  });

  it("gives other scripts, CJK and emoji a sensible width instead of nothing", () => {
    expect(textWidth("日本語", 10)).toBeCloseTo(30);
    expect(textWidth("🙂", 10)).toBeCloseTo(10);
    expect(textWidth("Привет", 10)).toBeGreaterThan(30);
    expect(textWidth("e\u0301", 10)).toBeCloseTo(textWidth("e", 10));
  });
});

describe("wrapLines", () => {
  it("wraps on spaces and keeps words whole", () => {
    const max = textWidth("11111 22222", 10);
    expect(wrapLines("11111 22222 33333 44444", max, 10)).toEqual(["11111 22222", "33333 44444"]);
  });

  it("fits exactly-full lines, and wraps one glyph earlier", () => {
    const text = "11111 22222";
    expect(wrapLines(text, textWidth(text, 10), 10)).toEqual([text]);
    expect(wrapLines(text, textWidth(text, 10) - 0.5, 10)).toEqual(["11111", "22222"]);
  });

  it("splits a word that is wider than a line", () => {
    const max = digitsWidth(8);
    expect(wrapLines("0".repeat(20), max, 10)).toEqual(["0".repeat(8), "0".repeat(8), "0".repeat(4)]);
    expect(wrapLines("ab " + "0".repeat(20), max, 10)).toEqual([
      "ab",
      "0".repeat(8),
      "0".repeat(8),
      "0".repeat(4),
    ]);
  });

  it("collapses runs of whitespace and handles empty input", () => {
    expect(wrapLines("  a   b \n c ", 1000, 10)).toEqual(["a b c"]);
    expect(wrapLines("   ", 1000, 10)).toEqual([]);
    expect(wrapLines("", 1000, 10)).toEqual([]);
  });

  it("treats an emoji as one character", () => {
    expect(wrapLines("🙂🙂🙂🙂 🙂🙂🙂🙂", textWidth("🙂🙂🙂🙂", 10), 10)).toEqual(["🙂🙂🙂🙂", "🙂🙂🙂🙂"]);
  });

  it("uses the bold widths when asked", () => {
    const text = "Wide Wide Wide";
    expect(wrapLines(text, textWidth(text, 20), 20)).toHaveLength(1);
    expect(wrapLines(text, textWidth(text, 20), 20, true).length).toBeGreaterThan(1);
  });

  it("never makes a line wider than the limit, and keeps every character (property check)", () => {
    let seed = 7;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const alphabet = [..."abcdefgWWWMMM ij  klm\tnop xyz🙂éWMi"];
    for (let n = 0; n < 300; n++) {
      const length = Math.floor(random() * 120);
      const text = Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
      const size = 10 + Math.floor(random() * 60);
      const bold = random() > 0.5;
      const max = 40 + random() * 600;
      const lines = wrapLines(text, max, size, bold);
      for (const line of lines) {
        const single = [...line].length === 1;
        expect(textWidth(line, size, bold) <= max || single).toBe(true);
      }
      expect(lines.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
    }
  });
});

describe("fitText", () => {
  it("uses the biggest size that fits", () => {
    expect(fitText("Short", 960, [80, 68, 58], 3, true)).toEqual({ size: 80, lines: ["Short"] });
  });

  it("steps down in size before wrapping to too many lines", () => {
    const long = "word ".repeat(15).trim();
    const fitted = fitText(long, 960, [80, 68, 58, 50], 3, true);
    expect(fitted.size).toBeLessThan(80);
    expect(fitted.lines.length).toBeLessThanOrEqual(3);
    expect(fitted.lines.join(" ")).toBe(long);
  });

  it("cuts with an ellipsis instead of overflowing", () => {
    const fitted = fitText("x".repeat(500), 400, [40, 30], 2);
    expect(fitted.lines).toHaveLength(2);
    expect(fitted.lines[1]?.endsWith("…")).toBe(true);
    for (const line of fitted.lines) expect(textWidth(line, fitted.size)).toBeLessThanOrEqual(400);
  });

  it("copes with the widest text there is: all capital W in bold", () => {
    const fitted = fitText("W".repeat(80), 960, [80, 68, 58, 50], 3, true);
    expect(fitted.lines.length).toBeLessThanOrEqual(3);
    for (const line of fitted.lines) expect(textWidth(line, fitted.size, true)).toBeLessThanOrEqual(960);
  });
});

describe("mixHex", () => {
  it("blends channel by channel", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#102030", "#102030", 0.7)).toBe("#102030");
    expect(mixHex("#ff0000", "#0000ff", 0)).toBe("#ff0000");
    expect(mixHex("#ff0000", "#0000ff", 1)).toBe("#0000ff");
  });
});

describe("parseCardDesign", () => {
  it("accepts a valid design and trims the text", () => {
    expect(
      parseCardDesign({
        template: "split",
        palette: "ocean",
        headline: "  Hi  ",
        subline: " there ",
        showHost: false,
      }),
    ).toEqual({
      ok: true,
      design: { template: "split", palette: "ocean", headline: "Hi", subline: "there", showHost: false },
    });
  });

  it("treats a missing subtitle as empty", () => {
    const result = parseCardDesign({ template: "plain", palette: "ink", headline: "Hi", showHost: true });
    expect(result).toMatchObject({ ok: true, design: { subline: "" } });
  });

  it.each([
    ["not an object", "nope"],
    ["null", null],
    ["unknown template", { template: "fancy", palette: "ink", headline: "Hi", showHost: true }],
    ["unknown palette", { template: "plain", palette: "orange", headline: "Hi", showHost: true }],
    ["no headline", { template: "plain", palette: "ink", headline: "   ", showHost: true }],
    ["numeric headline", { template: "plain", palette: "ink", headline: 5, showHost: true }],
    [
      "long headline",
      { template: "plain", palette: "ink", headline: "x".repeat(CARD_HEADLINE_MAX + 1), showHost: true },
    ],
    [
      "long subtitle",
      {
        template: "plain",
        palette: "ink",
        headline: "Hi",
        subline: "x".repeat(CARD_SUBLINE_MAX + 1),
        showHost: true,
      },
    ],
    ["missing showHost", { template: "plain", palette: "ink", headline: "Hi" }],
  ])("rejects %s", (_name, input) => {
    expect(parseCardDesign(input)).toMatchObject({ ok: false });
  });

  it("counts characters, not UTF-16 units, for the limits", () => {
    expect(
      parseCardDesign({
        template: "plain",
        palette: "ink",
        headline: "🙂".repeat(CARD_HEADLINE_MAX),
        showHost: true,
      }),
    ).toMatchObject({ ok: true });
  });
});

describe("composeCardSvg", () => {
  it("is a 1200x630 SVG with the text in it", () => {
    const svg = composeCardSvg(design(), "vialb.link");
    expect(svg).toContain(`width="${CARD_WIDTH}" height="${CARD_HEIGHT}"`);
    expect(svg).toContain(`viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}"`);
    expect(svg).toContain("Spring sale starts Friday");
    expect(svg).toContain("Up to 40% off everything in the shop");
    expect(svg).toContain(">vialb.link</text>");
  });

  it("is deterministic", () => {
    expect(composeCardSvg(design(), "vialb.link")).toBe(composeCardSvg(design(), "vialb.link"));
  });

  it("escapes user text so it cannot break out of the markup", () => {
    const svg = composeCardSvg(
      design({ headline: `</text><script>alert(1)</script> "quoted" & 'single'`, subline: "<b>bold</b>" }),
      "h&st.example",
    );
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<b>");
    expect(svg).toContain("&lt;/text&gt;&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;quoted&quot;");
    expect(svg).toContain("h&amp;st.example");
    // Every tag that opens also closes: the document stays well formed.
    expect(svg.match(/<text /g)?.length).toBe(svg.match(/<\/text>/g)?.length);
  });

  it("leaves out the host and the subtitle when asked", () => {
    const svg = composeCardSvg(design({ showHost: false, subline: "" }), "vialb.link");
    expect(svg).not.toContain("vialb.link");
    expect(svg).not.toContain("Up to 40%");
  });

  it("draws every template and palette without leaking colours outside the palette", () => {
    for (const template of CARD_TEMPLATES) {
      for (const palette of PALETTE_KEYS) {
        const svg = composeCardSvg(design({ template, palette }), "vialb.link");
        const colours = new Set(svg.match(/#[0-9a-fA-F]{6}\b/g)?.map((c) => c.toLowerCase()));
        const p = PALETTES[palette];
        const allowed = new Set(
          [p.bg, p.fg, p.muted, p.accent, mixHex(p.bg, p.accent, 0.22)].map((c) => c.toLowerCase()),
        );
        for (const colour of colours)
          expect(allowed.has(colour), `${template}/${palette} ${colour}`).toBe(true);
      }
    }
  });

  it("never lets a line run off the card or into the split panel, even for the widest text", () => {
    for (const template of CARD_TEMPLATES) {
      for (const shape of ["W", "M", "i", "@", "日"]) {
        const svg = composeCardSvg(
          design({
            template,
            headline: shape.repeat(CARD_HEADLINE_MAX),
            subline: shape.repeat(CARD_SUBLINE_MAX),
          }),
          "vialb.link",
        );
        const limit = template === "split" ? 780 - 24 : CARD_WIDTH - 48;
        for (const match of svg.matchAll(/<text x="(\d+)"[^>]*font-size="(\d+)"([^>]*)>([^<]*)<\/text>/g)) {
          const [, x, size, rest, content] = match;
          const bold = (rest ?? "").includes('font-weight="700"');
          const width = textWidth(unescapeXml(content ?? ""), Number(size), bold);
          expect(Number(x) + width, `${template} ${shape} "${content?.slice(0, 20)}"`).toBeLessThanOrEqual(
            limit,
          );
        }
      }
    }
  });

  it("keeps text inside the card for the longest allowed text", () => {
    for (const template of CARD_TEMPLATES) {
      const svg = composeCardSvg(
        design({ template, headline: "W".repeat(CARD_HEADLINE_MAX), subline: "w".repeat(CARD_SUBLINE_MAX) }),
        "vialb.link",
      );
      const ys = [...svg.matchAll(/<text [^>]*\by="(\d+)"/g)].map((m) => Number(m[1]));
      expect(Math.max(...ys), template).toBeLessThanOrEqual(CARD_HEIGHT - 30);
      expect(Math.min(...ys), template).toBeGreaterThan(40);
    }
  });
});

describe("card contrast", () => {
  const combos = CARD_TEMPLATES.flatMap((template) =>
    PALETTE_KEYS.map((palette) => [template, palette] as const),
  );

  it.each(combos)(
    "%s / %s keeps the headline and secondary text readable on every part of the background",
    (template, palette) => {
      const p = PALETTES[palette];
      for (const edge of backgroundEdges({ template, palette })) {
        expect(contrastRatio(p.fg, edge)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(p.muted, edge)).toBeGreaterThanOrEqual(3);
      }
    },
  );
});

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

describe("escapeXml", () => {
  it("escapes the five XML specials", () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
  });
});
