import { RateLimitedError, ValidationError } from "@/server/errors";
import { hostMatchesDomain, isBlockedHost, parseHttpUrl } from "@/server/lib/url";
import type { CaptchaVerifier } from "@/server/ports/captcha-verifier";
import type { RateLimiter, RateLimitResult } from "@/server/ports/rate-limiter";
import type { UrlSafetyChecker } from "@/server/ports/url-safety-checker";
import type { SettingsService } from "./settings.service";

export interface AbuseServiceDeps {
  settings: SettingsService;
  safety: UrlSafetyChecker;
  captcha: CaptchaVerifier;
  limiter: RateLimiter;
  /** Hostname of this instance (from SITE_URL); links back to it would loop. */
  siteHost: string;
}

export class AbuseService {
  constructor(private readonly deps: AbuseServiceDeps) {}

  get captchaSiteKey(): string | null {
    return this.deps.captcha.isEnabled ? this.deps.captcha.siteKey : null;
  }

  /** Scheme, self-reference, blocklist and (optional) Safe Browsing checks. */
  async assertDestinationAllowed(destination: string): Promise<void> {
    const url = parseHttpUrl(destination);
    if (!url)
      throw new ValidationError("Only http:// and https:// URLs are allowed", { field: "destinationUrl" });
    if (url.username || url.password) {
      throw new ValidationError("URLs with embedded credentials are not allowed", {
        field: "destinationUrl",
      });
    }
    if (hostMatchesDomain(url.hostname, this.deps.siteHost)) {
      throw new ValidationError("Links pointing to this instance are not allowed", {
        field: "destinationUrl",
      });
    }
    const { blockedDomains } = await this.deps.settings.get();
    if (isBlockedHost(url.hostname, blockedDomains)) {
      throw new ValidationError("This domain is not allowed on this instance", { field: "destinationUrl" });
    }
    const verdict = await this.deps.safety.check(url.toString());
    if (!verdict.safe) {
      throw new ValidationError("This URL was flagged as unsafe", {
        field: "destinationUrl",
        reason: verdict.reason,
      });
    }
  }

  async assertCaptcha(token: string | undefined, ip: string | null): Promise<void> {
    if (!this.deps.captcha.isEnabled) return;
    if (!(await this.deps.captcha.verify(token, ip))) {
      throw new ValidationError("Captcha verification failed, please try again", { field: "captcha" });
    }
  }

  async enforceRateLimit(key: string, rule: { limit: number; windowMs: number }): Promise<RateLimitResult> {
    const result = await this.deps.limiter.consume(key, rule.limit, rule.windowMs);
    if (!result.allowed) {
      throw new RateLimitedError(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)));
    }
    return result;
  }
}
