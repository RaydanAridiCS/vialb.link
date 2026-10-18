import QRCode from "qrcode";
import { HEX_COLOR_PATTERN } from "@/lib/constants";
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
}

export interface QrImage {
  body: string | Uint8Array;
  contentType: string;
}

/** QR codes are rendered on demand and never stored. */
export class QrService {
  constructor(private readonly deps: { links: LinkService; linkRepo: ILinkRepository; siteUrl: string }) {}

  async render(text: string, format: QrFormat, options: QrOptions = {}): Promise<QrImage> {
    const fg = options.fg ?? "#000000";
    const bg = options.bg ?? "#FFFFFF";
    if (!HEX_COLOR_PATTERN.test(fg) || !HEX_COLOR_PATTERN.test(bg)) {
      throw new ValidationError("Colors must be 6-digit hex values like #112233");
    }
    const size = Math.min(2048, Math.max(128, Math.round(options.size ?? 512)));
    const common = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: fg, light: bg } };
    if (format === "svg") {
      const svg = await QRCode.toString(text, { ...common, type: "svg" });
      return { body: svg, contentType: "image/svg+xml; charset=utf-8" };
    }
    const png = await QRCode.toBuffer(text, { ...common, type: "png", width: size });
    return { body: new Uint8Array(png), contentType: "image/png" };
  }

  private forLink(link: Link, format: QrFormat, options: QrOptions): Promise<QrImage> {
    return this.render(shortUrlFor(this.deps.siteUrl, link.code), format, {
      fg: options.fg ?? link.qrFgColor,
      bg: options.bg ?? link.qrBgColor,
      size: options.size,
    });
  }

  /** Authenticated QR for an owned link. */
  async forOwnedLink(
    actor: Actor,
    linkId: string,
    format: QrFormat,
    options: QrOptions = {},
  ): Promise<QrImage> {
    const link = await this.deps.links.getOwned(actor, linkId);
    return this.forLink(link, format, options);
  }

  /** Public `/[code]/qr` (only when PUBLIC_QR_ENDPOINT=true). Uses the saved colours. */
  async forPublicCode(code: string, format: QrFormat): Promise<QrImage | null> {
    const link = await this.deps.linkRepo.findByCode(code);
    if (!link || !link.isEnabled) return null;
    return this.forLink(link, format, {});
  }
}
