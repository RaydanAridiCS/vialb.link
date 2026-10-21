import "server-only";
import { env } from "@/lib/env";
import { enabledSocialProviders } from "@/server/auth/auth";
import { getContainer } from "@/server/container";

/** What the auth pages should offer on this instance. */
export async function getAuthPageConfig() {
  const { settings, mailer, repos } = getContainer();
  const [effective, userCount] = await Promise.all([
    settings.get().catch(() => ({
      allowAnonymousLinks: env.ALLOW_ANONYMOUS_LINKS,
      allowSignups: env.ALLOW_SIGNUPS,
      anonLinkTtlHours: env.ANON_LINK_TTL_HOURS,
      blockedDomains: [],
    })),
    repos.users.count().catch(() => 1),
  ]);
  return {
    providers: enabledSocialProviders,
    // Without SMTP, reset links only reach the server log, which is useful in development only.
    showForgot: mailer.isConfigured || env.NODE_ENV !== "production",
    allowSignups: effective.allowSignups || userCount === 0,
    requireVerification: env.REQUIRE_EMAIL_VERIFICATION,
  };
}
