import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const bool = (fallback: boolean) => z.stringbool().default(fallback);
const optionalString = z.string().min(1).optional();

/**
 * Validated environment. Importing this module throws on startup if any
 * variable is missing or malformed, so misconfiguration fails fast instead of
 * surfacing as a confusing runtime error. Every variable is documented in
 * `.env.example` and docs/configuration.md.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),
    // Prepared statements break PgBouncer in transaction pooling mode.
    DATABASE_PREPARE: bool(true),
    SITE_URL: z.url().transform((value) => value.replace(/\/+$/, "")),

    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: z
      .url()
      .optional()
      .transform((value) => value?.replace(/\/+$/, "")),
    GITHUB_CLIENT_ID: optionalString,
    GITHUB_CLIENT_SECRET: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    REQUIRE_EMAIL_VERIFICATION: bool(false),

    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: bool(false),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    SMTP_FROM: optionalString,

    ALLOW_ANONYMOUS_LINKS: bool(false),
    ALLOW_SIGNUPS: bool(true),
    ANON_LINK_TTL_HOURS: z.coerce.number().int().min(1).max(8760).default(720),
    ADMIN_EMAIL: z.email().optional(),

    REDIRECT_STATUS: z
      .enum(["302", "307"])
      .default("302")
      .transform((value) => Number(value) as 302 | 307),
    FORWARD_QUERY_PARAMS: bool(true),
    PUBLIC_QR_ENDPOINT: bool(false),
    REFERRER_POLICY: z
      .enum(["strict-origin-when-cross-origin", "unsafe-url", "origin", "no-referrer"])
      .default("strict-origin-when-cross-origin"),
    HSTS_MAX_AGE: z.coerce.number().int().min(0).default(15552000),

    TRUST_PROXY: bool(false),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(10).default(1),
    TRUST_PROXY_GEO_HEADERS: bool(false),
    GEOLITE2_DB_PATH: optionalString,

    REDIS_URL: z.url().optional(),
    TURNSTILE_SITE_KEY: optionalString,
    TURNSTILE_SECRET_KEY: optionalString,
    SAFE_BROWSING_API_KEY: optionalString,
    SENTRY_DSN: z.url().optional(),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  },
  client: {},
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
  // Escape hatch for tooling (lint, typegen) that imports modules without a
  // real environment. Never set this for a running server.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});

export type Env = typeof env;
