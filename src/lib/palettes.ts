/**
 * Fixed colour palettes shared by bio pages and social cards. Users pick a key, never a free colour,
 * so every combination is readable and the set stays on brand (no orange). Contrast is asserted in
 * tests/unit/palettes.test.ts.
 */
export const PALETTE_KEYS = ["paper", "ink", "forest", "ocean", "plum", "rose"] as const;
export type PaletteKey = (typeof PALETTE_KEYS)[number];

export interface Palette {
  label: string;
  /** Page / card background. */
  bg: string;
  /** Primary text on `bg`. */
  fg: string;
  /** Secondary text on `bg`. */
  muted: string;
  /** Filled button background and its text colour. */
  button: string;
  buttonFg: string;
  /** Decorative highlight (gradients, borders); never used for text. */
  accent: string;
}

export const PALETTES: Record<PaletteKey, Palette> = {
  paper: {
    label: "Paper",
    bg: "#F7F4EE",
    fg: "#1F1B16",
    muted: "#5E574D",
    button: "#1F1B16",
    buttonFg: "#F7F4EE",
    accent: "#0F7A55",
  },
  ink: {
    label: "Ink",
    bg: "#14110F",
    fg: "#F4EFE7",
    muted: "#A8A095",
    button: "#F4EFE7",
    buttonFg: "#14110F",
    accent: "#3DD9A0",
  },
  forest: {
    label: "Forest",
    bg: "#0E3B2E",
    fg: "#EAF6F0",
    muted: "#A9CDBE",
    button: "#EAF6F0",
    buttonFg: "#0E3B2E",
    accent: "#6EE7B7",
  },
  ocean: {
    label: "Ocean",
    bg: "#0B2A4A",
    fg: "#EAF2FB",
    muted: "#A9C1DB",
    button: "#EAF2FB",
    buttonFg: "#0B2A4A",
    accent: "#7CC4FF",
  },
  plum: {
    label: "Plum",
    bg: "#3A1F4D",
    fg: "#F6EDFB",
    muted: "#CBB4DA",
    button: "#F6EDFB",
    buttonFg: "#3A1F4D",
    accent: "#D9A7F5",
  },
  rose: {
    label: "Rose",
    bg: "#4A1F33",
    fg: "#FCEEF4",
    muted: "#E1B5C8",
    button: "#FCEEF4",
    buttonFg: "#4A1F33",
    accent: "#F59EC1",
  },
};

export function isPaletteKey(value: string): value is PaletteKey {
  return (PALETTE_KEYS as readonly string[]).includes(value);
}
