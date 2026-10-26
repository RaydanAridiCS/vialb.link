import { RATE_LIMITS } from "@/lib/constants";
import { hasPixels, optsOutOfTracking, parseConsent, type LinkPixels } from "@/lib/pixels";
import { needsGeo, pickRoute } from "@/lib/routing";
import { CARD_HEIGHT, CARD_WIDTH } from "@/lib/social-card";
import type { Link } from "@/server/domain/types";
import { GoneError, NotFoundError, RateLimitedError, ValidationError } from "@/server/errors";
import { isExpired } from "@/server/lib/expiry";
import { renderPreviewHtml } from "@/server/lib/html";
import { forwardQuery } from "@/server/lib/query";
import { detectPlatform, isAnyBot } from "@/server/lib/user-agent";
import type { GeoResolver } from "@/server/ports/geo-resolver";
import type { Clock } from "@/server/ports/clock";
import type { PasswordHasher } from "@/server/ports/password-hasher";
import type { RateLimiter } from "@/server/ports/rate-limiter";
import type { ILinkRepository } from "@/server/repositories/link.repository";
import { cardUrlFor, shortUrlFor } from "./dto";

export type RedirectDecision =
  | { kind: "not_found" }
  | { kind: "gone"; reason: "disabled" | "expired" | "limit" }
  | { kind: "preview"; linkId: string; html: string }
  | { kind: "password" }
  | { kind: "redirect"; linkId: string; destination: string; routedBy: string | null }
  /** The link has retargeting pixels: show the consent page, which forwards to `destination`. */
  | {
      kind: "pixel";
      linkId: string;
      destination: string;
      routedBy: string | null;
      pixels: LinkPixels;
      /** `granted` when the visitor already agreed; the page then loads tags without asking again. */
      consent: "ask" | "granted";
    };

export interface RedirectRequest {
  code: string;
  userAgent: string | null;
  searchParams: URLSearchParams;
  /** Client IP and request headers, only used to find the visitor's country for routing rules. */
  ip?: string | null;
  headers?: Headers;
}

export interface UnlockRequest {
  code: string;
  password: string;
  ip: string | null;
  searchParams?: URLSearchParams;
  userAgent?: string | null;
  headers?: Headers;
}

export interface RedirectServiceDeps {
  links: ILinkRepository;
  clock: Clock;
  hasher: PasswordHasher;
  limiter: RateLimiter;
  siteName: string;
  siteUrl: string;
  forwardQueryParams: boolean;
  /** Needed only for country routing rules; without it those rules never match. */
  geo?: GeoResolver;
  /** Whether the instance lets links use pixels right now. Without it pixels are off. */
  pixelsEnabled?: () => Promise<boolean>;
}

/**
 * The hot path. Decides what `GET /[code]` returns, in this exact order:
 * not found → disabled → expired → preview bot (OG page, no access consumed)
 * → password → atomic access-limit consume → smart routing → redirect (or the pixel page, when the
 * link has retargeting pixels and the visitor has not opted out).
 */
export class RedirectService {
  private dummyHash: Promise<string> | null = null;

  constructor(private readonly deps: RedirectServiceDeps) {}

  async resolve(request: RedirectRequest): Promise<RedirectDecision> {
    const link = await this.deps.links.findByCode(request.code);
    if (!link) return { kind: "not_found" };
    if (!link.isEnabled) return { kind: "gone", reason: "disabled" };
    if (isExpired(link.expiresAt, this.deps.clock.now())) return { kind: "gone", reason: "expired" };

    if (isAnyBot(request.userAgent)) {
      const isProtected = link.passwordHash !== null;
      const fallbackTitle = isProtected ? "Password-protected link" : safeHost(link.destinationUrl);
      return {
        kind: "preview",
        linkId: link.id,
        html: renderPreviewHtml({
          siteName: this.deps.siteName,
          shortUrl: shortUrlFor(this.deps.siteUrl, link.code),
          title: link.ogTitle ?? link.title ?? fallbackTitle,
          description: link.ogDescription,
          // An image link set by the owner wins; otherwise the designed card, which we serve ourselves.
          imageUrl: link.ogImageUrl ?? (link.cardDesign ? cardUrlFor(this.deps.siteUrl, link) : null),
          ...(link.ogImageUrl === null && link.cardDesign
            ? { imageWidth: CARD_WIDTH, imageHeight: CARD_HEIGHT, imageAlt: link.cardDesign.headline }
            : {}),
          // Never leak the destination of a protected link to anyone, bots included.
          destinationUrl: isProtected ? null : link.destinationUrl,
        }),
      };
    }

    if (link.passwordHash !== null) return { kind: "password" };

    const consumed = await this.deps.links.consumeAccess(link.id);
    if (consumed === null) return { kind: "gone", reason: "limit" };
    const { destination, routedBy } = await this.route(link, consumed, {
      userAgent: request.userAgent,
      ip: request.ip ?? null,
      headers: request.headers,
    });
    const target = this.deps.forwardQueryParams
      ? forwardQuery(destination, request.searchParams)
      : destination;
    const pixel = await this.pixelStep(link, target, request.headers);
    if (pixel) return { kind: "pixel", linkId: link.id, destination: target, routedBy, ...pixel };
    return { kind: "redirect", linkId: link.id, destination: target, routedBy };
  }

  /**
   * Decides whether a visitor goes through the pixel page. Not when the instance has pixels off, the
   * link has none, the visitor signals they do not want tracking, or they already said no.
   */
  private async pixelStep(
    link: Link,
    target: string,
    headers: Headers | undefined,
  ): Promise<{ pixels: LinkPixels; consent: "ask" | "granted" } | null> {
    if (!hasPixels(link.pixels) || !/^https?:\/\//i.test(target)) return null;
    if (optsOutOfTracking(headers)) return null;
    if (!(await this.deps.pixelsEnabled?.())) return null;
    const consent = parseConsent(headers?.get("cookie"));
    if (consent === "denied") return null;
    return { pixels: link.pixels, consent: consent === "granted" ? "granted" : "ask" };
  }

  /**
   * Smart routing: the first rule matching the visitor's device and country replaces the normal
   * destination. Links without rules skip this entirely, and the country lookup (local, no network)
   * only runs when some rule asks for one. Anything unknown simply falls through to the default.
   */
  private async route(
    link: Link,
    defaultDestination: string,
    visitor: { userAgent: string | null; ip: string | null; headers?: Headers },
  ): Promise<{ destination: string; routedBy: string | null }> {
    if (link.routingRules.length === 0) return { destination: defaultDestination, routedBy: null };

    let country: string | null = null;
    if (needsGeo(link.routingRules) && this.deps.geo) {
      try {
        country = (await this.deps.geo.resolve({ ip: visitor.ip, headers: visitor.headers ?? new Headers() }))
          .country;
      } catch {
        // A failing lookup must never break the redirect.
      }
    }
    const match = pickRoute(link.routingRules, { platform: detectPlatform(visitor.userAgent), country });
    return match
      ? { destination: match.rule.url, routedBy: match.label }
      : { destination: defaultDestination, routedBy: "default" };
  }

  /** Side-effect-free check used for HEAD requests (link checkers must not consume access). */
  async isReachable(code: string): Promise<boolean> {
    const link = await this.deps.links.findByCode(code);
    return !!link && link.isEnabled && !isExpired(link.expiresAt, this.deps.clock.now());
  }

  /** Whether a link exists and is password protected (for the password page). */
  async describeProtected(code: string): Promise<"protected" | "unprotected" | "missing"> {
    const link = await this.deps.links.findByCode(code);
    if (!link) return "missing";
    return link.passwordHash ? "protected" : "unprotected";
  }

  /** Password page submit. Generic errors only; rate limited per (IP, code) and per code. */
  async unlock(
    request: UnlockRequest,
  ): Promise<{ linkId: string; destination: string; routedBy: string | null }> {
    await this.limit(`pw:ip:${request.ip ?? "unknown"}:${request.code}`, RATE_LIMITS.passwordPerIpCode);
    await this.limit(`pw:code:${request.code}`, RATE_LIMITS.passwordPerCode);

    const link = await this.deps.links.findByCode(request.code);
    if (!link || link.passwordHash === null) {
      // Spend comparable time so response timing doesn't reveal which codes exist.
      await this.deps.hasher.verify(await this.getDummyHash(), request.password);
      throw new NotFoundError("Link not found");
    }
    if (!link.isEnabled) throw new GoneError("disabled");
    if (isExpired(link.expiresAt, this.deps.clock.now())) throw new GoneError("expired");

    const verification = await this.deps.hasher.verify(link.passwordHash, request.password);
    if (!verification.valid) throw new ValidationError("Incorrect password", { field: "password" });
    if (verification.needsRehash) {
      await this.deps.links.update(link.id, { passwordHash: await this.deps.hasher.hash(request.password) });
    }

    const consumed = await this.deps.links.consumeAccess(link.id);
    if (consumed === null) throw new GoneError("limit");
    const { destination, routedBy } = await this.route(link, consumed, {
      userAgent: request.userAgent ?? null,
      ip: request.ip,
      headers: request.headers,
    });
    return {
      linkId: link.id,
      destination:
        this.deps.forwardQueryParams && request.searchParams
          ? forwardQuery(destination, request.searchParams)
          : destination,
      routedBy,
    };
  }

  private async limit(key: string, rule: { limit: number; windowMs: number }) {
    const result = await this.deps.limiter.consume(key, rule.limit, rule.windowMs);
    if (!result.allowed) {
      throw new RateLimitedError(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)));
    }
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.deps.hasher.hash("timing-equalizer-not-a-real-password");
    return this.dummyHash;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Shared link";
  }
}
