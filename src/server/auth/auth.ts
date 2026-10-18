import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, twoFactor } from "better-auth/plugins";
import { APP_NAME } from "@/lib/constants";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getContainer } from "@/server/container";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";

import { renderPasswordResetEmail, renderVerificationEmail } from "@/server/auth/email-templates";

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
}
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export const enabledSocialProviders = Object.keys(socialProviders) as ("github" | "google")[];

async function sendMail(to: string, subject: string, text: string, html?: string) {
  try {
    await getContainer().mailer.send({ to, subject, text, html });
  } catch (error) {
    logger.error({ err: error, subject }, "Failed to send email");
  }
}

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: env.BETTER_AUTH_URL ?? env.SITE_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.SITE_URL, ...(env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : [])],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      twoFactor: schema.twoFactor,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const { text, html } = renderPasswordResetEmail({
        appName: APP_NAME,
        siteUrl: env.SITE_URL,
        resetUrl: url,
        userEmail: user.email,
        userName: user.name,
      });
      await sendMail(user.email, `Reset your ${APP_NAME} password`, text, html);
    },
  },
  emailVerification: {
    sendOnSignUp: env.REQUIRE_EMAIL_VERIFICATION,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { text, html } = renderVerificationEmail({
        appName: APP_NAME,
        siteUrl: env.SITE_URL,
        verificationUrl: url,
        userEmail: user.email,
        userName: user.name,
      });
      await sendMail(user.email, `Verify your ${APP_NAME} email`, text, html);
    },
  },
  socialProviders,
  user: {
    deleteUser: { enabled: true },
  },
  advanced: {
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const { repos, settings } = getContainer();
          const isFirstUser = (await repos.users.count()) === 0;
          const isConfiguredAdmin =
            !!env.ADMIN_EMAIL && user.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();
          if (!isFirstUser && !isConfiguredAdmin && !(await settings.get()).allowSignups) {
            throw new APIError("FORBIDDEN", { message: "Sign-ups are disabled on this instance" });
          }
          // The very first account (or ADMIN_EMAIL) becomes the instance admin.
          return { data: { ...user, role: isFirstUser || isConfiguredAdmin ? "admin" : "user" } };
        },
      },
    },
  },
  plugins: [
    twoFactor({ issuer: APP_NAME }),
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    // Must be last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
