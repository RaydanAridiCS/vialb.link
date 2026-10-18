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

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
}
if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export const enabledSocialProviders = Object.keys(socialProviders) as ("github" | "google")[];

async function sendMail(to: string, subject: string, text: string) {
  try {
    await getContainer().mailer.send({ to, subject, text });
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
      await sendMail(
        user.email,
        `Reset your ${APP_NAME} password`,
        `Someone requested a password reset for your ${APP_NAME} account.\n\nReset it here (valid for 1 hour):\n${url}\n\nIf this wasn't you, ignore this email.`,
      );
    },
  },
  emailVerification: {
    sendOnSignUp: env.REQUIRE_EMAIL_VERIFICATION,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail(user.email, `Verify your ${APP_NAME} email`, `Confirm your email address:\n${url}`);
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
