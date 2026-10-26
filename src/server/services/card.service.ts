import { cardVersion, composeCardSvg, parseCardDesign } from "@/lib/social-card";
import type { Clock } from "@/server/ports/clock";
import type { ILinkRepository } from "@/server/repositories/link.repository";
import { linkStatus } from "./dto";

export interface CardImage {
  body: Uint8Array;
  contentType: string;
  /** Suggested file name for downloads. */
  filename: string;
}

const CACHE_SIZE = 200;

/**
 * Renders a link's designed social card as a PNG for link-preview crawlers and for downloads. The card
 * is drawn from the design alone (never from the destination), so serving it publicly reveals nothing
 * the owner did not choose to put on it. Images are cached per design, so each card is rasterised once.
 */
export class CardService {
  private readonly cache = new Map<string, Uint8Array>();

  constructor(private readonly deps: { linkRepo: ILinkRepository; siteUrl: string; clock: Clock }) {}

  /** The card for a short code, or `null` when the link has no card or is not live (disabled, expired, used up). */
  async forCode(code: string): Promise<CardImage | null> {
    const link = await this.deps.linkRepo.findByCode(code);
    if (!link?.cardDesign) return null;
    if (linkStatus(link, this.deps.clock.now()) !== "active") return null;

    // Rows are validated on the way in, but never trust stored JSON blindly when drawing from it.
    const parsed = parseCardDesign(link.cardDesign);
    if (!parsed.ok) return null;
    const { design } = parsed;

    const key = `${link.id}:${cardVersion(design)}`;
    let body = this.cache.get(key);
    if (body) {
      // Refresh recency so the busiest cards are the last to be evicted.
      this.cache.delete(key);
    } else {
      // sharp (native) is only loaded once a card is actually requested.
      const { default: sharp } = await import("sharp");
      const svg = composeCardSvg(design, new URL(this.deps.siteUrl).host);
      body = new Uint8Array(await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer());
      if (this.cache.size >= CACHE_SIZE) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
    }
    this.cache.set(key, body);
    return { body, contentType: "image/png", filename: `${link.code}-card.png` };
  }
}
