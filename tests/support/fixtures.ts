import { MemoryRateLimiter } from "@/server/adapters/rate-limiters";
import { NoopCaptchaVerifier, NoopUrlSafetyChecker } from "@/server/adapters/external-checks";
import type { Actor } from "@/server/domain/types";
import type { CaptchaVerifier } from "@/server/ports/captcha-verifier";
import type { Clock } from "@/server/ports/clock";
import type { CodeGenerator } from "@/server/ports/code-generator";
import type { GeoResolver } from "@/server/ports/geo-resolver";
import type { PasswordHasher } from "@/server/ports/password-hasher";
import type { UrlSafetyChecker } from "@/server/ports/url-safety-checker";
import { InMemoryBioRepository } from "@/server/repositories/in-memory/bio.repository.memory";
import { InMemoryLinkRepository } from "@/server/repositories/in-memory/link.repository.memory";
import {
  InMemoryApiKeyRepository,
  InMemoryClickRepository,
  InMemorySettingsRepository,
  InMemoryUserRepository,
} from "@/server/repositories/in-memory/other.repositories.memory";
import { AbuseService } from "@/server/services/abuse.service";
import { AdminService } from "@/server/services/admin.service";
import { AnalyticsService } from "@/server/services/analytics.service";
import { BioService } from "@/server/services/bio.service";
import { CardService } from "@/server/services/card.service";
import { ApiKeyService } from "@/server/services/api-key.service";
import { LinkService } from "@/server/services/link.service";
import { QrService } from "@/server/services/qr.service";
import { RedirectService } from "@/server/services/redirect.service";
import { SettingsService } from "@/server/services/settings.service";
import { logger } from "@/lib/logger";

export class FakeClock implements Clock {
  constructor(public current = new Date("2026-06-01T12:00:00Z")) {}
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

/** Deterministic code generator; returns queued codes first, then counters. */
export class SequenceCodeGenerator implements CodeGenerator {
  readonly queue: string[] = [];
  readonly lengths: number[] = [];
  private n = 0;
  generate(length: number): string {
    this.lengths.push(length);
    return this.queue.shift() ?? `g${String(this.n++).padStart(length - 1, "0")}`;
  }
}

/** Fast fake hasher ("plain:<pw>"); `legacy:` hashes report needsRehash like bcrypt. */
export class FakeHasher implements PasswordHasher {
  async hash(plain: string) {
    return `plain:${plain}`;
  }
  async verify(hash: string, plain: string) {
    if (hash.startsWith("legacy:")) {
      const valid = hash === `legacy:${plain}`;
      return { valid, needsRehash: valid };
    }
    return { valid: hash === `plain:${plain}`, needsRehash: false };
  }
}

export const SITE_URL = "https://sho.rt";

export const users = {
  alice: { kind: "user", userId: "alice", role: "user" } as Actor,
  bob: { kind: "user", userId: "bob", role: "user" } as Actor,
  admin: { kind: "user", userId: "root", role: "admin" } as Actor,
  anon: { kind: "anonymous", ip: "203.0.113.7" } as Actor,
};

export interface FixtureOptions {
  allowAnonymousLinks?: boolean;
  blockedDomains?: string[];
  safety?: UrlSafetyChecker;
  captcha?: CaptchaVerifier;
  geo?: GeoResolver;
  forwardQueryParams?: boolean;
}

export function buildFixture(options: FixtureOptions = {}) {
  const clock = new FakeClock();
  const linkRepo = new InMemoryLinkRepository(() => clock.now());
  const clickRepo = new InMemoryClickRepository();
  const bioRepo = new InMemoryBioRepository(() => clock.now());
  const settingsRepo = new InMemorySettingsRepository();
  const userRepo = new InMemoryUserRepository();
  const apiKeyRepo = new InMemoryApiKeyRepository();
  const limiter = new MemoryRateLimiter(() => clock.now().getTime());
  const codes = new SequenceCodeGenerator();
  const hasher = new FakeHasher();
  const settings = new SettingsService(
    settingsRepo,
    {
      allowAnonymousLinks: options.allowAnonymousLinks ?? false,
      allowSignups: true,
      anonLinkTtlHours: 24,
      blockedDomains: options.blockedDomains ?? [],
    },
    () => clock.now().getTime(),
  );
  const abuse = new AbuseService({
    settings,
    limiter,
    siteHost: "sho.rt",
    safety: options.safety ?? new NoopUrlSafetyChecker(),
    captcha: options.captcha ?? new NoopCaptchaVerifier(),
  });
  const links = new LinkService({
    links: linkRepo,
    clock,
    codes,
    hasher,
    abuse,
    settings,
    siteUrl: SITE_URL,
    ipPepper: "pepper",
  });
  const redirect = new RedirectService({
    links: linkRepo,
    clock,
    hasher,
    limiter,
    siteName: "Vialb",
    siteUrl: SITE_URL,
    forwardQueryParams: options.forwardQueryParams ?? true,
    geo: options.geo,
  });
  const analytics = new AnalyticsService({
    clicks: clickRepo,
    links,
    settingsRepo,
    geo: options.geo ?? { resolve: async () => ({ country: "FR", region: null, city: "Paris" }) },
    clock,
    logger,
  });
  return {
    clock,
    linkRepo,
    clickRepo,
    bioRepo,
    settingsRepo,
    userRepo,
    apiKeyRepo,
    limiter,
    codes,
    hasher,
    settings,
    abuse,
    links,
    redirect,
    analytics,
    bio: new BioService({
      bio: bioRepo,
      links,
      linkRepo,
      users: userRepo,
      abuse,
      clock,
      siteUrl: SITE_URL,
    }),
    card: new CardService({ linkRepo, siteUrl: SITE_URL, clock }),
    qr: new QrService({ links, linkRepo, siteUrl: SITE_URL }),
    apiKeys: new ApiKeyService({ apiKeys: apiKeyRepo, users: userRepo, clock }),
    admin: new AdminService({ users: userRepo, links: linkRepo, clicks: clickRepo, clock }),
  };
}
