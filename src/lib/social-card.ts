import { textWidth } from "@/lib/font-metrics";
import { isPaletteKey, PALETTES, type PaletteKey } from "@/lib/palettes";

/**
 * Social card studio: a designed 1200x630 preview image for a link, drawn from a handful of choices
 * (template, palette, two lines of text). The same SVG is shown live in the form and rasterised by the
 * server for crawlers, so what people design is what gets shared. Pure: no I/O.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

export const CARD_TEMPLATES = ["plain", "gradient", "split"] as const;
export type CardTemplate = (typeof CARD_TEMPLATES)[number];

export const CARD_TEMPLATE_LABELS: Record<CardTemplate, string> = {
  plain: "Plain",
  gradient: "Gradient",
  split: "Split",
};

export const CARD_HEADLINE_MAX = 80;
export const CARD_SUBLINE_MAX = 100;

export interface CardDesign {
  template: CardTemplate;
  palette: PaletteKey;
  headline: string;
  subline: string;
  /** Shows the short link's host in the corner. */
  showHost: boolean;
}

export const DEFAULT_CARD_DESIGN: CardDesign = {
  template: "gradient",
  palette: "forest",
  headline: "",
  subline: "",
  showHost: true,
};

export function isCardTemplate(value: string): value is CardTemplate {
  return (CARD_TEMPLATES as readonly string[]).includes(value);
}

export type CardDesignResult = { ok: true; design: CardDesign } | { ok: false; error: string };

/** Validates untrusted input (a request body or a database row) and returns a clean design. */
export function parseCardDesign(raw: unknown): CardDesignResult {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Card design must be an object" };
  const input = raw as Record<string, unknown>;
  const { template, palette, headline, subline, showHost } = input;
  if (typeof template !== "string" || !isCardTemplate(template)) {
    return { ok: false, error: "Unknown card template" };
  }
  if (typeof palette !== "string" || !isPaletteKey(palette))
    return { ok: false, error: "Unknown card palette" };
  if (typeof headline !== "string") return { ok: false, error: "The card needs a headline" };
  const cleanHeadline = headline.trim();
  if (!cleanHeadline) return { ok: false, error: "The card needs a headline" };
  if ([...cleanHeadline].length > CARD_HEADLINE_MAX) {
    return { ok: false, error: `The headline can be at most ${CARD_HEADLINE_MAX} characters` };
  }
  const cleanSubline = typeof subline === "string" ? subline.trim() : "";
  if ([...cleanSubline].length > CARD_SUBLINE_MAX) {
    return { ok: false, error: `The subtitle can be at most ${CARD_SUBLINE_MAX} characters` };
  }
  if (typeof showHost !== "boolean") return { ok: false, error: "showHost must be true or false" };
  return {
    ok: true,
    design: { template, palette, headline: cleanHeadline, subline: cleanSubline, showHost },
  };
}

/**
 * A short fingerprint of a design (FNV-1a over its fields). It goes into the card URL as `?v=`, so a
 * changed design gets a new URL and crawlers and CDNs fetch the new image instead of a cached one.
 */
export function cardVersion(design: CardDesign): string {
  const text = [design.template, design.palette, design.headline, design.subline, design.showHost].join(
    "\u0000",
  );
  let hash = 0x811c9dc5;
  for (const ch of text) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Escapes text for XML text nodes and attribute values (the card text is user input). */
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

const FONT_STACK = "'DejaVu Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif";

/**
 * Greedy word wrap by measured width (DejaVu Sans, see font-metrics.ts). A word wider than a whole line
 * is split. Counts code points, so an emoji is one character, and never returns a line wider than
 * `maxWidth` unless a single glyph is.
 */
export function wrapLines(text: string, maxWidth: number, size: number, bold = false): string[] {
  const width = (value: string) => textWidth(value, size, bold);
  const space = width(" ");
  const lines: string[] = [];
  let line = "";
  let lineWidth = 0;

  const flush = () => {
    if (line) lines.push(line);
    line = "";
    lineWidth = 0;
  };

  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word;
    while (rest) {
      const wordWidth = width(rest);
      const needed = line ? lineWidth + space + wordWidth : wordWidth;
      if (needed <= maxWidth) {
        line = line ? `${line} ${rest}` : rest;
        lineWidth = needed;
        rest = "";
      } else if (line) {
        flush();
      } else {
        // The word alone is too wide: take as many characters as fit (at least one) and carry on.
        let taken = "";
        for (const char of rest) {
          if (taken && width(taken + char) > maxWidth) break;
          taken += char;
        }
        lines.push(taken);
        rest = rest.slice(taken.length);
      }
    }
  }
  flush();
  return lines;
}

export interface FittedText {
  size: number;
  lines: string[];
}

/**
 * Picks the biggest of `sizes` at which `text` fits in `maxLines` lines of `widthPx`. If even the
 * smallest does not fit, it is cut with an ellipsis rather than overflowing the card.
 */
export function fitText(
  text: string,
  widthPx: number,
  sizes: readonly number[],
  maxLines: number,
  bold = false,
): FittedText {
  let last: FittedText = { size: sizes[sizes.length - 1] ?? 32, lines: [] };
  for (const size of sizes) {
    const lines = wrapLines(text, widthPx, size, bold);
    last = { size, lines };
    if (lines.length <= maxLines) return last;
  }
  const kept = last.lines.slice(0, maxLines);
  const tail = [...(kept[maxLines - 1] ?? "")];
  while (tail.length > 0 && textWidth(`${tail.join("")}…`, last.size, bold) > widthPx) tail.pop();
  kept[maxLines - 1] = `${tail.join("").trimEnd()}…`;
  return { size: last.size, lines: kept };
}

/** Blends two #rrggbb colours; `t` is the share of `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(channel(a, i) * (1 - t) + channel(b, i) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** The darkest/lightest point of a card's background where text can sit; used to check contrast. */
export const GRADIENT_MIX = 0.22;
export function backgroundEdges(design: Pick<CardDesign, "template" | "palette">): string[] {
  const p = PALETTES[design.palette];
  return design.template === "gradient" ? [p.bg, mixHex(p.bg, p.accent, GRADIENT_MIX)] : [p.bg];
}

interface Layout {
  textX: number;
  textWidth: number;
  headlineSizes: number[];
  sublineSizes: number[];
  sublineLines: number;
}

const LAYOUTS: Record<CardTemplate, Layout> = {
  plain: {
    textX: 132,
    textWidth: 960,
    headlineSizes: [80, 68, 58, 50],
    sublineSizes: [36, 32],
    sublineLines: 2,
  },
  gradient: {
    textX: 96,
    textWidth: 1008,
    headlineSizes: [80, 68, 58, 50],
    sublineSizes: [36, 32],
    sublineLines: 2,
  },
  split: {
    textX: 84,
    textWidth: 640,
    headlineSizes: [68, 58, 50, 44],
    sublineSizes: [32, 28, 25],
    sublineLines: 3,
  },
};

/** The card as an SVG document, 1200x630. `host` is the short link's host, shown when `showHost` is on. */
export function composeCardSvg(design: CardDesign, host: string): string {
  const p = PALETTES[design.palette];
  const layout = LAYOUTS[design.template];
  const headline = fitText(design.headline, layout.textWidth, layout.headlineSizes, 3, true);
  const subline = design.subline
    ? fitText(design.subline, layout.textWidth, layout.sublineSizes, layout.sublineLines)
    : null;

  const headlineHeight = headline.lines.length * headline.size * 1.18;
  const gap = subline ? 30 : 0;
  const sublineHeight = subline ? subline.lines.length * subline.size * 1.4 : 0;
  const blockHeight = headlineHeight + gap + sublineHeight;
  // Centre the text block in the area above the host line.
  const top = Math.max(70, 70 + (440 - blockHeight) / 2);

  const text: string[] = [];
  headline.lines.forEach((line, i) => {
    const y = Math.round(top + headline.size * 0.92 + i * headline.size * 1.18);
    text.push(
      `<text x="${layout.textX}" y="${y}" font-size="${headline.size}" font-weight="700" fill="${p.fg}">${escapeXml(line)}</text>`,
    );
  });
  if (subline) {
    const base = top + headlineHeight + gap;
    subline.lines.forEach((line, i) => {
      const y = Math.round(base + subline.size * 0.95 + i * subline.size * 1.4);
      text.push(
        `<text x="${layout.textX}" y="${y}" font-size="${subline.size}" fill="${p.muted}">${escapeXml(line)}</text>`,
      );
    });
  }
  if (design.showHost && host) {
    text.push(
      `<text x="${layout.textX}" y="570" font-size="28" font-weight="700" fill="${p.muted}">${escapeXml(host)}</text>`,
    );
  }

  let background: string;
  switch (design.template) {
    case "gradient":
      background = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg}"/><stop offset="1" stop-color="${mixHex(p.bg, p.accent, GRADIENT_MIX)}"/></linearGradient></defs>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)"/>
  <circle cx="1090" cy="-30" r="340" fill="${p.accent}" fill-opacity="0.14"/>
  <circle cx="1190" cy="640" r="220" fill="${p.accent}" fill-opacity="0.1"/>`;
      break;
    case "split":
      background = `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${p.bg}"/>
  <rect x="780" width="420" height="${CARD_HEIGHT}" fill="${p.accent}"/>
  <circle cx="990" cy="315" r="170" fill="${p.bg}" fill-opacity="0.2"/>
  <circle cx="990" cy="315" r="96" fill="${p.bg}" fill-opacity="0.3"/>`;
      break;
    default:
      background = `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${p.bg}"/>
  <rect x="72" y="90" width="12" height="450" rx="6" fill="${p.accent}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" font-family="${FONT_STACK}" role="img" aria-label="${escapeXml(design.headline)}">
  ${background}
  ${text.join("\n  ")}
</svg>`;
}
