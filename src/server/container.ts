import "server-only";
import { Redis } from "ioredis";
import { APP_NAME } from "@/lib/constants";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { Argon2PasswordHasher } from "@/server/adapters/argon2-password-hasher";
import { NanoidCodeGenerator, SystemClock } from "@/server/adapters/basic";
import {
  NoopCaptchaVerifier,
  NoopUrlSafetyChecker,
  SafeBrowsingChecker,
  TurnstileVerifier,
} from "@/server/adapters/external-checks";
import { ChainGeoResolver, HeaderGeoResolver, MaxMindGeoResolver } from "@/server/adapters/geo";
import { ConsoleMailer, SmtpMailer } from "@/server/adapters/mailers";
import { MemoryRateLimiter, RedisRateLimiter } from "@/server/adapters/rate-limiters";
import { db } from "@/server/db/client";
import type { GeoResolver } from "@/server/ports/geo-resolver";
import type { Mailer } from "@/server/ports/mailer";
import type { RateLimiter } from "@/server/ports/rate-limiter";
import { DrizzleBioRepository } from "@/server/repositories/drizzle/bio.repository.drizzle";
import { DrizzleApiKeyRepository } from "@/server/repositories/drizzle/api-key.repository.drizzle";
import { DrizzleClickRepository } from "@/server/repositories/drizzle/click.repository.drizzle";
import { DrizzleHealthRepository } from "@/server/repositories/drizzle/health.repository.drizzle";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { DrizzleSettingsRepository } from "@/server/repositories/drizzle/settings.repository.drizzle";
import { DrizzleUserRepository } from "@/server/repositories/drizzle/user.repository.drizzle";
import { DrizzleWorkspaceRepository } from "@/server/repositories/drizzle/workspace.repository.drizzle";
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
import { WorkspaceService } from "@/server/services/workspace.service";
import { collectConfigWarnings } from "@/server/startup-checks";

/**
 * Composition root: the only place that knows which concrete adapters and
 * repositories back each port. Built once per process (no DI framework).
 */
function buildContainer() {
  // Only production builds the container once per process, so this logs once.
  // `next build` evaluates pages without the runtime config, so skip it there.
  if (env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    for (const warning of collectConfigWarnings(env)) logger.warn(warning);
  }

  const clock = new SystemClock();
  const siteUrl = env.SITE_URL;
  const siteHost = new URL(siteUrl).hostname;

  const repos = {
    links: new DrizzleLinkRepository(db),
    clicks: new DrizzleClickRepository(db),
    apiKeys: new DrizzleApiKeyRepository(db),
    settings: new DrizzleSettingsRepository(db),
    users: new DrizzleUserRepository(db),
    health: new DrizzleHealthRepository(db),
    bio: new DrizzleBioRepository(db),
    workspaces: new DrizzleWorkspaceRepository(db),
  };

  let limiter: RateLimiter = new MemoryRateLimiter();
  if (env.REDIS_URL) {
    const redisUrl = env.REDIS_URL;
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true,
      lazyConnect: false,
    });
    redis.on("error", (error) => logger.error({ err: error }, "Redis error"));
    limiter = new RedisRateLimiter(redis);
  }

  const geoResolvers: GeoResolver[] = [];
  if (env.TRUST_PROXY_GEO_HEADERS) geoResolvers.push(new HeaderGeoResolver());
  if (env.GEOLITE2_DB_PATH) geoResolvers.push(new MaxMindGeoResolver(env.GEOLITE2_DB_PATH));
  const geo = new ChainGeoResolver(geoResolvers);

  const mailer: Mailer =
    env.SMTP_HOST && env.SMTP_FROM
      ? new SmtpMailer({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
          from: env.SMTP_FROM,
        })
      : new ConsoleMailer();

  const settings = new SettingsService(repos.settings, {
    allowAnonymousLinks: env.ALLOW_ANONYMOUS_LINKS,
    allowSignups: env.ALLOW_SIGNUPS,
    anonLinkTtlHours: env.ANON_LINK_TTL_HOURS,
    blockedDomains: [],
    pixelsEnabled: env.PIXELS_ENABLED,
  });

  const abuse = new AbuseService({
    settings,
    limiter,
    siteHost,
    safety: env.SAFE_BROWSING_API_KEY
      ? new SafeBrowsingChecker(env.SAFE_BROWSING_API_KEY)
      : new NoopUrlSafetyChecker(),
    captcha:
      env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY
        ? new TurnstileVerifier(env.TURNSTILE_SITE_KEY, env.TURNSTILE_SECRET_KEY)
        : new NoopCaptchaVerifier(),
  });

  const hasher = new Argon2PasswordHasher();
  const links = new LinkService({
    links: repos.links,
    clock,
    codes: new NanoidCodeGenerator(),
    hasher,
    abuse,
    settings,
    siteUrl,
    ipPepper: env.BETTER_AUTH_SECRET,
  });

  const workspaces = new WorkspaceService({
    workspaces: repos.workspaces,
    users: repos.users,
    mailer,
    abuse,
    clock,
    siteUrl,
    siteName: APP_NAME,
  });

  return {
    clock,
    limiter,
    mailer,
    repos,
    workspaces,
    settings,
    abuse,
    links,
    redirect: new RedirectService({
      links: repos.links,
      clock,
      hasher,
      limiter,
      siteName: APP_NAME,
      siteUrl,
      forwardQueryParams: env.FORWARD_QUERY_PARAMS,
      geo,
      pixelsEnabled: async () => (await settings.get()).pixelsEnabled,
    }),
    analytics: new AnalyticsService({
      clicks: repos.clicks,
      links,
      settingsRepo: repos.settings,
      geo,
      clock,
      logger,
    }),
    bio: new BioService({
      bio: repos.bio,
      links,
      linkRepo: repos.links,
      users: repos.users,
      abuse,
      clock,
      siteUrl,
      personalWorkspaceId: (userId) => workspaces.personalWorkspaceId(userId),
    }),
    card: new CardService({ linkRepo: repos.links, siteUrl, clock }),
    qr: new QrService({ links, linkRepo: repos.links, siteUrl }),
    apiKeys: new ApiKeyService({
      apiKeys: repos.apiKeys,
      users: repos.users,
      workspaces: repos.workspaces,
      clock,
    }),
    admin: new AdminService({ users: repos.users, links: repos.links, clicks: repos.clicks, clock }),
  };
}

export type Container = ReturnType<typeof buildContainer>;

declare global {
  var __vialbContainer: Container | undefined;
}

export function getContainer(): Container {
  if (env.NODE_ENV === "development") {
    return buildContainer();
  }
  // Cached on globalThis in production so warm workers share rate-limit state and pools.
  globalThis.__vialbContainer ??= buildContainer();
  return globalThis.__vialbContainer;
}
