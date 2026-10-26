/**
 * QR code design options and the checks around them. Pure and dependency-free, so the zod schemas,
 * the server and the browser preview all agree on the same rules.
 */

/** Error correction: how much of the code can be damaged or covered and still scan. */
export const QR_ECC_LEVELS = ["L", "M", "Q", "H"] as const;
export type QrEcc = (typeof QR_ECC_LEVELS)[number];

export const QR_ECC_LABELS: Record<QrEcc, string> = {
  L: "Low (7%): smallest code",
  M: "Medium (15%)",
  Q: "Quartile (25%)",
  H: "High (30%): best for print and logos",
};

/** What new links start with. Links created before QR options existed keep `M` (the column default). */
export const DEFAULT_QR_ECC: QrEcc = "H";

export const QR_FRAMES = ["none", "badge"] as const;
export type QrFrame = (typeof QR_FRAMES)[number];

export const QR_FRAME_LABELS: Record<QrFrame, string> = {
  none: "No frame",
  badge: "Badge under the code",
};

export const QR_FRAME_TEXT_MAX = 24;
export const DEFAULT_QR_FRAME_TEXT = "Scan me";

/** Below this contrast ratio a code is practically unreadable, so saving is refused. */
export const QR_MIN_CONTRAST = 2;
/** Below this, or with light-on-dark colours, many scanners struggle: we warn. */
export const QR_WARN_CONTRAST = 3;

export interface QrDesign {
  fg: string;
  bg: string;
  ecc: QrEcc;
  frame: QrFrame;
  /** Text on the badge; `null` falls back to "Scan me". */
  frameText: string | null;
}

export function isQrEcc(value: string): value is QrEcc {
  return (QR_ECC_LEVELS as readonly string[]).includes(value);
}

export function isQrFrame(value: string): value is QrFrame {
  return (QR_FRAMES as readonly string[]).includes(value);
}

/** Strips control characters, collapses whitespace and caps the length. Empty input becomes `null`. */
export function normalizeFrameText(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const text = Array.from(cleaned).slice(0, QR_FRAME_TEXT_MAX).join("").trim();
  return text === "" ? null : text;
}

/** The text actually drawn on the badge. */
export function frameLabel(frameText: string | null | undefined): string {
  return normalizeFrameText(frameText) ?? DEFAULT_QR_FRAME_TEXT;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#RRGGBB` colour (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
}

/** WCAG contrast ratio between two `#RRGGBB` colours: 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

export interface QrWarning {
  /** `block` colours cannot be saved; `warn` ones can, but may not scan everywhere. */
  severity: "block" | "warn";
  code: "low-contrast" | "inverted";
  message: string;
}

/** Scannability problems of a colour pair. Expects valid `#RRGGBB` values. */
export function qrWarnings(fg: string, bg: string): QrWarning[] {
  const ratio = contrastRatio(fg, bg);
  const warnings: QrWarning[] = [];
  if (ratio < QR_MIN_CONTRAST) {
    warnings.push({
      severity: "block",
      code: "low-contrast",
      message: "These colours are too similar: scanners will not be able to read this code.",
    });
  } else if (ratio < QR_WARN_CONTRAST) {
    warnings.push({
      severity: "warn",
      code: "low-contrast",
      message: "Low contrast: some phones may struggle to scan this code. Use a darker foreground.",
    });
  }
  if (relativeLuminance(fg) > relativeLuminance(bg) && ratio >= QR_MIN_CONTRAST) {
    warnings.push({
      severity: "warn",
      code: "inverted",
      message: "Light code on a dark background: many scanners cannot read inverted codes.",
    });
  }
  return warnings;
}

export function isScannable(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= QR_MIN_CONTRAST;
}
