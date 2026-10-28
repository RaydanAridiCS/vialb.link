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
import { HttpUrlProbe } from "@/server/adapters/url-probe";
import { MemoryRateLimiter, RedisRateLimiter } from "@/server/adapters/rate-limiters";
import { db } from "@/server/db/client";
import type { GeoResolver } from "@/server/ports/geo-resolver";
import type { Mailer } from "@/server/ports/mailer";
import type { RateLimiter } from "@/server/ports/rate-limiter";
import { DrizzleBioRepository } from "@/server/repositories/drizzle/bio.repository.drizzle";
import { DrizzleApiKeyRepository } from "@/server/repositories/drizzle/api-key.repository.drizzle";
import { DrizzleClickRepository } from "@/server/repositories/drizzle/click.repository.drizzle";
import { DrizzleConversionRepository } from "@/server/repositories/drizzle/conversion.repository.drizzle";
import { DrizzleFolderRepository } from "@/server/repositories/drizzle/folder.repository.drizzle";
import { DrizzleHealthRepository } from "@/server/repositories/drizzle/health.repository.drizzle";
import { DrizzleJobRepository } from "@/server/repositories/drizzle/job.repository.drizzle";
import { DrizzleEmailDeliveryRepository } from "@/server/repositories/drizzle/email-delivery.repository.drizzle";
import { DrizzleLinkHealthRepository } from "@/server/repositories/drizzle/link-health.repository.drizzle";
import { DrizzleUserPreferencesRepository } from "@/server/repositories/drizzle/user-preferences.repository.drizzle";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { DrizzleSettingsRepository } from "@/server/repositories/drizzle/settings.repository.drizzle";
import { DrizzleUserRepository } from "@/server/repositories/drizzle/user.repository.drizzle";
import { DrizzleWorkspaceRepository } from "@/server/repositories/drizzle/workspace.repository.drizzle";
import { AbuseService } from "@/server/services/abuse.service";
import { AdminService } from "@/server/services/admin.service";
import { AnalyticsService } from "@/server/services/analytics.service";
import { BioService } from "@/server/services/bio.service";
import { FolderService } from "@/server/services/folder.service";
import { HealthMonitorService } from "@/server/services/health-monitor.service";
import { JobRunner, type Job } from "@/server/jobs/job-runner";
import { CardService } from "@/server/services/card.service";
import { ApiKeyService } from "@/server/services/api-key.service";
import { LinkService } from "@/server/services/link.service";
import { QrService } from "@/server/services/qr.service";
import { ConversionService } from "@/server/services/conversion.service";
import { ReportService } from "@/server/services/report.service";
import { RetentionService } from "@/server/services/retention.service";
import { RedirectService } from "@/server/services/redirect.service";
import { SettingsService } from "@/server/services/settings.service";
import { WorkspaceService } from "@/server/services/workspace.service";
import { DailySaltProvider } from "@/server/lib/daily-salt";
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
    jobs: new DrizzleJobRepository(db),
    linkHealth: new DrizzleLinkHealthRepository(db),
    preferences: new DrizzleUserPreferencesRepository(db),
    deliveries: new DrizzleEmailDeliveryRepository(db),
    conversions: new DrizzleConversionRepository(db),
    folders: new DrizzleFolderRepository(db),
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

  const salts = new DailySaltProvider(repos.settings);
  const settings = new SettingsService(repos.settings, {
    allowAnonymousLinks: env.ALLOW_ANONYMOUS_LINKS,
    allowSignups: env.ALLOW_SIGNUPS,
    anonLinkTtlHours: env.ANON_LINK_TTL_HOURS,
    blockedDomains: [],
    pixelsEnabled: env.PIXELS_ENABLED,
    healthMonitorEnabled: env.HEALTH_MONITOR_ENABLED,
    weeklyReportEnabled: env.WEEKLY_REPORT_ENABLED,
    reportSendDay: env.REPORT_SEND_DAY,
    reportSendHourUtc: env.REPORT_SEND_HOUR_UTC,
    clickRetentionDays: env.CLICK_RETENTION_DAYS,
  });

  const safety = env.SAFE_BROWSING_API_KEY
    ? new SafeBrowsingChecker(env.SAFE_BROWSING_API_KEY)
    : new NoopUrlSafetyChecker();
  const abuse = new AbuseService({
    settings,
    limiter,
    siteHost,
    safety,
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
    health: repos.linkHealth,
    folders: repos.folders,
    workspaces: repos.workspaces,
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

  const healthIntervalMs = env.HEALTH_CHECK_INTERVAL_HOURS * 3_600_000;
  const healthMonitor = new HealthMonitorService({
    health: repos.linkHealth,
    links,
    probe: new HttpUrlProbe({
      userAgent: `${APP_NAME}-LinkHealth/1.0 (+${siteUrl})`,
      allowPrivate: env.HEALTH_ALLOW_PRIVATE_TARGETS,
    }),
    safety,
    abuse,
    settings,
    clock,
    logger,
    policy: {
      failureThreshold: env.HEALTH_FAILURE_THRESHOLD,
      intervalMs: healthIntervalMs,
      retryMs: Math.min(healthIntervalMs, 3_600_000),
    },
  });

  const reports = new ReportService({
    clicks: repos.clicks,
    workspaces: repos.workspaces,
    users: repos.users,
    preferences: repos.preferences,
    deliveries: repos.deliveries,
    health: repos.linkHealth,
    abuse,
    mailer,
    settings,
    clock,
    logger,
    siteUrl,
    siteName: APP_NAME,
  });

  const retention = new RetentionService({
    clicks: repos.clicks,
    settingsRepo: repos.settings,
    settings,
    clock,
    logger,
  });

  // Scheduled work. Each pass picks up whatever is due, so the intervals here only bound how late it can be.
  const jobList: Job[] = [
    {
      name: "link-health",
      intervalMs: 5 * 60_000,
      isEnabled: () => healthMonitor.isEnabled(),
      run: () => healthMonitor.runDue(),
    },
    // These two run often but only act inside the configured send window, once per person and week.
    {
      name: "weekly-report",
      intervalMs: 15 * 60_000,
      isEnabled: () => reports.isEnabled(),
      run: () => reports.runWeekly(),
    },
    {
      name: "broken-links-digest",
      intervalMs: 15 * 60_000,
      isEnabled: () => reports.isBrokenLinksEnabled(),
      run: () => reports.runBrokenLinks(),
    },
    // Always on: pruning old daily salts is part of the privacy design; click deletion needs a retention period.
    { name: "retention", intervalMs: 24 * 3_600_000, run: () => retention.run() },
  ];
  const jobRunner = new JobRunner({ clock, repo: repos.jobs, jobs: jobList, logger });

  return {
    clock,
    limiter,
    mailer,
    repos,
    jobRunner,
    healthMonitor,
    reports,
    retention,
    folders: new FolderService({ folders: repos.folders }),
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
      salts,
    }),
    analytics: new AnalyticsService({
      clicks: repos.clicks,
      links,
      settingsRepo: repos.settings,
      geo,
      clock,
      logger,
      limiter,
      salts,
      conversions: repos.conversions,
    }),
    conversions: new ConversionService({
      conversions: repos.conversions,
      limiter,
      clock,
      logger,
      windowDays: env.CONVERSION_WINDOW_DAYS,
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
