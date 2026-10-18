import { RATE_LIMITS } from "@/lib/constants";
import { GoneError, NotFoundError, RateLimitedError, ValidationError } from "@/server/errors";
import { isExpired } from "@/server/lib/expiry";
import { renderPreviewHtml } from "@/server/lib/html";
import { forwardQuery } from "@/server/lib/query";
import { isAnyBot } from "@/server/lib/user-agent";
import type { Clock } from "@/server/ports/clock";
import type { PasswordHasher } from "@/server/ports/password-hasher";
import type { RateLimiter } from "@/server/ports/rate-limiter";
import type { ILinkRepository } from "@/server/repositories/link.repository";
import { shortUrlFor } from "./dto";

export type RedirectDecision =
  | { kind: "not_found" }
  | { kind: "gone"; reason: "disabled" | "expired" | "limit" }
  | { kind: "preview"; linkId: string; html: string }
  | { kind: "password" }
  | { kind: "redirect"; linkId: string; destination: string };

export interface RedirectRequest {
  code: string;
  userAgent: string | null;
  searchParams: URLSearchParams;
}

export interface UnlockRequest {
  code: string;
  password: string;
  ip: string | null;
  searchParams?: URLSearchParams;
}

export interface RedirectServiceDeps {
  links: ILinkRepository;
  clock: Clock;
  hasher: PasswordHasher;
  limiter: RateLimiter;
  siteName: string;
  siteUrl: string;
  forwardQueryParams: boolean;
}

/**
 * The hot path. Decides what `GET /[code]` returns, in this exact order:
 * not found → disabled → expired → preview bot (OG page, no access consumed)
 * → password → atomic access-limit consume → redirect.
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
          imageUrl: link.ogImageUrl,
          // Never leak the destination of a protected link to anyone, bots included.
          destinationUrl: isProtected ? null : link.destinationUrl,
        }),
      };
    }

    if (link.passwordHash !== null) return { kind: "password" };

    const destination = await this.deps.links.consumeAccess(link.id);
    if (destination === null) return { kind: "gone", reason: "limit" };
    return {
      kind: "redirect",
      linkId: link.id,
      destination: this.deps.forwardQueryParams
        ? forwardQuery(destination, request.searchParams)
        : destination,
    };
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
  async unlock(request: UnlockRequest): Promise<{ linkId: string; destination: string }> {
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

    const destination = await this.deps.links.consumeAccess(link.id);
    if (destination === null) throw new GoneError("limit");
    return {
      linkId: link.id,
      destination:
        this.deps.forwardQueryParams && request.searchParams
          ? forwardQuery(destination, request.searchParams)
          : destination,
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
