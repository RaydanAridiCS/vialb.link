import { APP_NAME } from "@/lib/constants";
import { logger } from "@/lib/logger";
import type { CaptchaVerifier } from "@/server/ports/captcha-verifier";
import type { UrlSafetyChecker, UrlSafetyVerdict } from "@/server/ports/url-safety-checker";

const TIMEOUT_MS = 5000;

export class NoopUrlSafetyChecker implements UrlSafetyChecker {
  async check(): Promise<UrlSafetyVerdict> {
    return { safe: true };
  }
}

/**
 * Google Safe Browsing v4 Lookup API. Runs only when a link is created or
 * its destination changes (never per click). Fails open on API errors so an
 * outage cannot block link creation; failures are logged.
 */
export class SafeBrowsingChecker implements UrlSafetyChecker {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async check(url: string): Promise<UrlSafetyVerdict> {
    try {
      const response = await this.fetchImpl(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(this.apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          body: JSON.stringify({
            client: { clientId: APP_NAME.toLowerCase(), clientVersion: "1.0.0" },
            threatInfo: {
              threatTypes: [
                "MALWARE",
                "SOCIAL_ENGINEERING",
                "UNWANTED_SOFTWARE",
                "POTENTIALLY_HARMFUL_APPLICATION",
              ],
              platformTypes: ["ANY_PLATFORM"],
              threatEntryTypes: ["URL"],
              threatEntries: [{ url }],
            },
          }),
        },
      );
      if (!response.ok) {
        logger.warn({ status: response.status }, "Safe Browsing lookup failed; allowing URL");
        return { safe: true };
      }
      const body = (await response.json()) as { matches?: { threatType?: string }[] };
      if (body.matches && body.matches.length > 0) {
        return { safe: false, reason: body.matches[0]?.threatType ?? "THREAT" };
      }
      return { safe: true };
    } catch (error) {
      logger.warn({ err: error }, "Safe Browsing lookup errored; allowing URL");
      return { safe: true };
    }
  }
}

export class NoopCaptchaVerifier implements CaptchaVerifier {
  readonly isEnabled = false;
  readonly siteKey = null;
  async verify(): Promise<boolean> {
    return true;
  }
}

/** Cloudflare Turnstile server-side verification. */
export class TurnstileVerifier implements CaptchaVerifier {
  readonly isEnabled = true;

  constructor(
    readonly siteKey: string,
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async verify(token: string | undefined, ip: string | null): Promise<boolean> {
    if (!token) return false;
    try {
      const form = new URLSearchParams({ secret: this.secretKey, response: token });
      if (ip) form.set("remoteip", ip);
      const response = await this.fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await response.json()) as { success?: boolean };
      return body.success === true;
    } catch (error) {
      logger.warn({ err: error }, "Turnstile verification errored");
      return false;
    }
  }
}
