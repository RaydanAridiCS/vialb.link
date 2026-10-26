import QRCode from "qrcode";
import { DEFAULT_QR_BG, DEFAULT_QR_FG, HEX_COLOR_PATTERN } from "@/lib/constants";
import { isQrEcc, isQrFrame, normalizeFrameText, type QrDesign } from "@/lib/qr-options";
import { composeQrSvg } from "@/lib/qr-svg";
import type { Actor, Link } from "@/server/domain/types";
import { ValidationError } from "@/server/errors";
import type { ILinkRepository } from "@/server/repositories/link.repository";
import { shortUrlFor } from "./dto";
import type { LinkService } from "./link.service";

export type QrFormat = "svg" | "png";

export interface QrOptions {
  fg?: string;
  bg?: string;
  /** PNG width in pixels. */
  size?: number;
  /** Error correction level (`L`, `M`, `Q`, `H`). Unvalidated text from a query string is fine: `render` checks it. */
  ecc?: string;
  frame?: string;
  frameText?: string | null;
}

export interface QrImage {
  body: string | Uint8Array;
  contentType: string;
}

const PNG_MIN = 128;
const PNG_MAX = 2048;

/** QR codes are rendered on demand and never stored. */
export class QrService {
  constructor(private readonly deps: { links: LinkService; linkRepo: ILinkRepository; siteUrl: string }) {}

  async render(text: string, format: QrFormat, options: QrOptions = {}): Promise<QrImage> {
    const fg = options.fg ?? DEFAULT_QR_FG;
    const bg = options.bg ?? DEFAULT_QR_BG;
    if (!HEX_COLOR_PATTERN.test(fg) || !HEX_COLOR_PATTERN.test(bg)) {
      throw new ValidationError("Colors must be 6-digit hex values like #112233");
    }
    const ecc = options.ecc ?? "M";
    if (!isQrEcc(ecc)) throw new ValidationError("ecc must be one of L, M, Q or H");
    const frame = options.frame ?? "none";
    if (!isQrFrame(frame)) throw new ValidationError("frame must be none or badge");
    const design: QrDesign = { fg, bg, ecc, frame, frameText: normalizeFrameText(options.frameText) };
    const requested = options.size !== undefined && Number.isFinite(options.size) ? options.size : 512;
    const size = Math.min(PNG_MAX, Math.max(PNG_MIN, Math.round(requested)));

    if (format === "svg") {
      return { body: composeQrSvg(text, design), contentType: "image/svg+xml; charset=utf-8" };
    }
    if (frame === "none") {
      const png = await QRCode.toBuffer(text, {
        errorCorrectionLevel: ecc,
        margin: 2,
        color: { dark: fg, light: bg },
        type: "png",
        width: size,
      });
      return { body: new Uint8Array(png), contentType: "image/png" };
    }
    // The frame is not something `qrcode` can draw, so the same SVG the browser previews is rasterised.
    // sharp (native) is only loaded when a framed PNG is actually requested.
    const { default: sharp } = await import("sharp");
    const png = await sharp(Buffer.from(composeQrSvg(text, design, { pixelWidth: size })))
      .png()
      .toBuffer();
    return { body: new Uint8Array(png), contentType: "image/png" };
  }

  private forLink(link: Link, format: QrFormat, options: QrOptions): Promise<QrImage> {
    return this.render(shortUrlFor(this.deps.siteUrl, link.code), format, {
      fg: options.fg ?? link.qrFgColor,
      bg: options.bg ?? link.qrBgColor,
      size: options.size,
      ecc: options.ecc ?? link.qrEcc,
      frame: options.frame ?? link.qrFrame,
      frameText: options.frameText !== undefined ? options.frameText : link.qrFrameText,
    });
  }

  /** Authenticated QR for an owned link. */
  async forOwnedLink(
    actor: Actor,
    linkId: string,
    format: QrFormat,
    options: QrOptions = {},
  ): Promise<QrImage> {
    const link = await this.deps.links.getOwned(actor, linkId, "link:read");
    return this.forLink(link, format, options);
  }

  /** Public `/[code]/qr` (only when PUBLIC_QR_ENDPOINT=true). Uses the saved design. */
  async forPublicCode(code: string, format: QrFormat): Promise<QrImage | null> {
    const link = await this.deps.linkRepo.findByCode(code);
    if (!link || !link.isEnabled) return null;
    return this.forLink(link, format, {});
  }
}
