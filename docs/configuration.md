# Configuration

All configuration comes from environment variables, validated at startup by
[`src/lib/env.ts`](../src/lib/env.ts) (zod + `@t3-oss/env-nextjs`). A missing or
malformed value stops the server with a clear error instead of failing later.
Copy [`.env.example`](../.env.example) to `.env` to get started.

Booleans accept `true/false`, `1/0`, `yes/no`, `on/off`.

## Core

| Variable                  | Default      | Description                                                                                                                  |
| ------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`                | — (required) | Public base URL, e.g. `https://go.example.com`. Used for every absolute URL: short links, OG tags, QR codes, auth callbacks. |
| `DATABASE_URL`            | — (required) | PostgreSQL connection string.                                                                                                |
| `BETTER_AUTH_SECRET`      | — (required) | ≥ 32 random characters (`openssl rand -base64 32`). Signs sessions and peppers creator-IP hashes.                            |
| `BETTER_AUTH_URL`         | `SITE_URL`   | Only needed if auth is served from a different origin.                                                                       |
| `DATABASE_POOL_MAX`       | `10`         | Connections per app process. Total is replicas × this value, so keep it below Postgres' `max_connections`.                   |
| `DATABASE_PREPARE`        | `true`       | Prepared statements. Set `false` behind PgBouncer in transaction pooling mode.                                               |
| `SENTRY_DSN`              | —            | Enables server-side error reporting to Sentry or GlitchTip. See [Error monitoring](self-hosting.md#error-monitoring).        |
| `LOG_LEVEL`               | `info`       | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. JSON logs in production, pretty logs in development.           |
| `NEXT_TELEMETRY_DISABLED` | —            | Set to `1` to opt out of Next.js' anonymous telemetry.                                                                       |

## Accounts & email

| Variable                                                                                     | Default | Description                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ALLOW_SIGNUPS`                                                                              | `true`  | Default for new sign-ups (admins can override in the UI). The first account can always be created.                                                                                   |
| `ADMIN_EMAIL`                                                                                | —       | This email becomes admin on sign-up (in addition to the very first user).                                                                                                            |
| `REQUIRE_EMAIL_VERIFICATION`                                                                 | `false` | Require a verified email before signing in (needs SMTP).                                                                                                                             |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`                                                  | —       | Enables "Continue with GitHub". Callback: `${SITE_URL}/api/auth/callback/github`.                                                                                                    |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                                                  | —       | Enables "Continue with Google". Callback: `${SITE_URL}/api/auth/callback/google`.                                                                                                    |
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (false), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | —       | Email delivery for password resets and verification. Without `SMTP_HOST` + `SMTP_FROM`, emails are written to the server log and the "forgot password" link is hidden in production. |

## Links & redirects

| Variable                | Default                           | Description                                                                     |
| ----------------------- | --------------------------------- | ------------------------------------------------------------------------------- |
| `ALLOW_ANONYMOUS_LINKS` | `false`                           | Default for anonymous creation from the landing page (admin can override).      |
| `ANON_LINK_TTL_HOURS`   | `720`                             | Forced lifetime of anonymous links (1–8760).                                    |
| `REDIRECT_STATUS`       | `302`                             | `302` or `307`. Permanent redirects are never used for short links.             |
| `FORWARD_QUERY_PARAMS`  | `true`                            | Append the short link's query string (e.g. `?utm_source=x`) to the destination. |
| `REFERRER_POLICY`       | `strict-origin-when-cross-origin` | Sent with redirects. `unsafe-url` passes the full short URL to destinations.    |
| `PUBLIC_QR_ENDPOINT`    | `false`                           | Expose `/{code}/qr?format=svg                                                   | png` without authentication. |

## Reverse proxy, client IP & headers

| Variable             | Default    | Description                                                                                                                               |
| -------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY`        | `false`    | Trust `X-Forwarded-For`. **Only enable behind a proxy you control.**                                                                      |
| `TRUSTED_PROXY_HOPS` | `1`        | Number of proxies in front of Vialb. The client IP is the entry this many positions from the right (e.g. Cloudflare → Caddy → app = `2`). |
| `HSTS_MAX_AGE`       | `15552000` | Seconds for `Strict-Transport-Security` (sent only when `SITE_URL` is https). `0` disables it.                                            |

**How the client IP is determined.** With `TRUST_PROXY=true`, Vialb reads
`X-Forwarded-For` from the right and skips `TRUSTED_PROXY_HOPS - 1` entries;
entries further left are client-controlled and ignored. With `TRUST_PROXY=false`
it uses the socket address. Next.js only exposes that address by adding it as
`X-Forwarded-For` when the header is absent, so a client talking to the app
directly could spoof it. Always run production behind a reverse proxy and enable
`TRUST_PROXY`. The IP is used for rate limiting and visitor hashing only; it is
never stored.

## Geolocation

| Variable                  | Default | Description                                                                                                                                             |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUST_PROXY_GEO_HEADERS` | `false` | Read country/region/city from CDN headers (`cf-ipcountry`, `cf-ipcity`, `x-vercel-ip-country`, `cloudfront-viewer-country`, …). Only behind such a CDN. |
| `GEOLITE2_DB_PATH`        | —       | Path to a MaxMind GeoLite2 City (or Country) `.mmdb` file, used when headers don't provide a country.                                                   |

Without either, location is "Unknown". Vialb never calls a third-party
geolocation API. The same sources decide **country rules in [smart routing](smart-routing.md)**: with
neither configured, those rules are skipped and visitors go to the link's normal destination.

## Scaling & anti-abuse

| Variable                                      | Default | Description                                                                                               |
| --------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `REDIS_URL`                                   | —       | Shared rate limiting across replicas (`redis://host:6379`). Without it, limits are per process.           |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | —       | Cloudflare Turnstile on anonymous link creation.                                                          |
| `SAFE_BROWSING_API_KEY`                       | —       | Google Safe Browsing lookup when a link is created or its destination changes (fails open on API errors). |

At startup in production the server logs a warning for each weakness it can detect:
no `REDIS_URL`, no `SAFE_BROWSING_API_KEY`, no `SENTRY_DSN`, a non-https `SITE_URL`,
`TRUST_PROXY=false`, a half-configured Turnstile, or anonymous links without Turnstile
(see [`startup-checks.ts`](../src/server/startup-checks.ts)). If Redis is configured but
unreachable, rate limiting fails open (requests are allowed and the error is logged).

## Backups (sidecar)

Used by the `backup` compose profile and `scripts/backup/backup.sh`, not by the app itself.
See [Backups](self-hosting.md#backups).

| Variable                                      | Default  | Description                                                                |
| --------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `BACKUP_AGE_RECIPIENT`                        | required | `age` public key the dumps are encrypted to.                               |
| `BACKUP_S3_BUCKET`                            | —        | Upload here. Empty keeps files in `BACKUP_HOST_DIR` (default `./backups`). |
| `BACKUP_S3_ENDPOINT`                          | —        | S3-compatible endpoint, e.g. Cloudflare R2.                                |
| `BACKUP_S3_PREFIX`                            | `vialb`  | Key prefix inside the bucket.                                              |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | —        | Credentials for the bucket.                                                |
| `BACKUP_RETENTION_DAYS`                       | `30`     | Delete backups older than this. `0` keeps everything.                      |
| `BACKUP_INTERVAL_HOURS`                       | `24`     | Time between backups in the sidecar container.                             |

## Docker Compose helpers

| Variable                                              | Default  | Description                                     |
| ----------------------------------------------------- | -------- | ----------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `vialb`  | Credentials for the bundled Postgres container. |
| `APP_PORT`                                            | `3000`   | Host port for the app container.                |
| `VIALB_VERSION`                                       | `latest` | Image tag to run.                               |
| `SKIP_MIGRATIONS`                                     | `false`  | Skip running migrations on container start.     |

## Instance settings in the admin UI

`/admin` lets administrators override **anonymous links**, **sign-ups**,
**anonymous link lifetime** and the **blocked domains** list. Overrides are
stored in the `instance_settings` table; choosing "Default" falls back to the
environment value again. Changes take effect within ~5 seconds on every
instance.

## Rate limits

| What                                          | Limit                                                |
| --------------------------------------------- | ---------------------------------------------------- |
| Link creation (signed-in user, admins exempt) | 60 / hour                                            |
| Link creation (anonymous, per IP)             | 10 / hour                                            |
| Password attempts                             | 10 / 15 min per (IP, link) and 100 / 15 min per link |
| REST API                                      | 120 / minute per API key (`X-RateLimit-*` headers)   |
| Sign-in / sign-up                             | Better Auth's built-in limits                        |

Limits are defined in [`src/lib/constants.ts`](../src/lib/constants.ts).
