export interface ConfigSnapshot {
  NODE_ENV: "development" | "test" | "production";
  SITE_URL: string;
  REDIS_URL?: string;
  SAFE_BROWSING_API_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ALLOW_ANONYMOUS_LINKS: boolean;
  TRUST_PROXY: boolean;
  SENTRY_DSN?: string;
  PIXELS_ENABLED?: boolean;
  HEALTH_ALLOW_PRIVATE_TARGETS?: boolean;
  WEEKLY_REPORT_ENABLED?: boolean;
  CLICK_RETENTION_DAYS?: number;
  REQUIRE_ADMIN_2FA?: boolean;
  ADMIN_2FA_EMERGENCY_OFF?: boolean;
  SMTP_HOST?: string;
  SMTP_FROM?: string;
}

/**
 * Misconfigurations that don't stop the server but silently weaken it. Logged
 * once at startup so operators notice them before users or attackers do. Pure
 * so it can be unit-tested; the container decides how to log the result.
 */
export function collectConfigWarnings(config: ConfigSnapshot): string[] {
  const warnings: string[] = [];

  if (config.TURNSTILE_SITE_KEY && !config.TURNSTILE_SECRET_KEY) {
    warnings.push("TURNSTILE_SITE_KEY is set without TURNSTILE_SECRET_KEY: captcha is disabled.");
  }
  if (config.TURNSTILE_SECRET_KEY && !config.TURNSTILE_SITE_KEY) {
    warnings.push("TURNSTILE_SECRET_KEY is set without TURNSTILE_SITE_KEY: captcha is disabled.");
  }
  const captchaOn = Boolean(config.TURNSTILE_SITE_KEY && config.TURNSTILE_SECRET_KEY);
  if (config.ALLOW_ANONYMOUS_LINKS && !captchaOn) {
    warnings.push(
      "Anonymous link creation is enabled without Cloudflare Turnstile: bots can create links. Set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.",
    );
  }

  if (config.PIXELS_ENABLED && !config.SITE_URL.startsWith("https://")) {
    warnings.push(
      "PIXELS_ENABLED is on but SITE_URL is not https: the consent cookie cannot be marked Secure. Use https before sending visitors through ad pixels.",
    );
  }

  if (config.HEALTH_ALLOW_PRIVATE_TARGETS && config.NODE_ENV === "production") {
    warnings.push(
      "HEALTH_ALLOW_PRIVATE_TARGETS is on: the link health monitor can request private and internal addresses. Only use it on a private deployment where every user is trusted.",
    );
  }
  if (config.WEEKLY_REPORT_ENABLED && !(config.SMTP_HOST && config.SMTP_FROM)) {
    warnings.push(
      "WEEKLY_REPORT_ENABLED is on but SMTP_HOST / SMTP_FROM are not set: no report emails can be sent.",
    );
  }

  if (config.ADMIN_2FA_EMERGENCY_OFF) {
    warnings.push(
      "ADMIN_2FA_EMERGENCY_OFF is on: administrators are not required to use two-factor authentication whatever the saved setting says. Remove it once access is restored.",
    );
  }
  if (config.CLICK_RETENTION_DAYS && config.CLICK_RETENTION_DAYS > 0) {
    warnings.push(
      `CLICK_RETENTION_DAYS=${config.CLICK_RETENTION_DAYS}: clicks older than that are deleted for good every day. Make sure backups cover anything you need to keep.`,
    );
  }

  if (config.NODE_ENV === "production") {
    if (!config.REDIS_URL) {
      warnings.push(
        "REDIS_URL is not set: rate limits are per process and reset on restart. Set it when running several replicas.",
      );
    }
    if (!config.SAFE_BROWSING_API_KEY) {
      warnings.push(
        "SAFE_BROWSING_API_KEY is not set: destinations are not checked for phishing or malware.",
      );
    }
    if (!config.SENTRY_DSN) {
      warnings.push("SENTRY_DSN is not set: unexpected server errors are only written to the log.");
    }
    if (!config.SITE_URL.startsWith("https://")) {
      warnings.push("SITE_URL is not https: HSTS and upgrade-insecure-requests are disabled.");
    }
    if (!config.TRUST_PROXY) {
      warnings.push(
        "TRUST_PROXY is false: every visitor shares the proxy's IP for rate limits and analytics. Set it when running behind a reverse proxy or Cloudflare.",
      );
    }
  }

  return warnings;
}
