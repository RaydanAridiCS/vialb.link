The prompt (final deliverable)

# Build "ToolWright": an open-source, self-hostable URL shortener

You are building a brand-new, production-quality, open-source URL shortener in an EMPTY directory.
It replaces a messy URL shortener that used to live inside a larger toolkit site (Express + React + Prisma/SQLite).
Do not copy that code. The requirements below are distilled from it, including its bugs (which you must NOT reproduce).
Project name: **ToolWright** (keep the name in one constant/config so it is trivial to rename).

Work in phases. At the end of each phase, run typecheck + lint + tests and commit with a Conventional Commit message.
Before choosing versions, check the latest stable versions (`npm view <pkg> version`) and use them; do not use canary/beta.

---

## 1. Tech stack (use exactly this unless a package is dead/deprecated, then explain the swap)

- **Runtime / PM:** Node.js current LTS, **npm**, `"packageManager"` field set, `.nvmrc`.
- **Framework:** **Next.js (latest stable, App Router, React Server Components, Server Actions, Route Handlers)**, `output: "standalone"`.
  Use the request-interception file name the installed Next version expects (`proxy.ts` on Next 16+, `middleware.ts` before).
- **Language:** TypeScript `strict: true`, `noUncheckedIndexedAccess: true`, path alias `@/*`.
- **UI:** **Tailwind CSS v4**, **shadcn/ui** (init via CLI, New York style, CSS variables), `lucide-react`, `next-themes` (light/dark/system), `sonner` toasts, shadcn **Charts** (Recharts) for analytics.
- **Forms/validation:** `react-hook-form` + `zod` (shared schemas used by both client and server), `@hookform/resolvers`.
- **Server actions:** `next-safe-action` (typed, zod-validated actions with auth middleware).
- **Database:** **PostgreSQL** + **Drizzle ORM** + `drizzle-kit` migrations (committed SQL migrations, not `push`), `postgres` (postgres.js) driver.
- **Auth:** **Better Auth** with the Drizzle adapter: email+password, optional GitHub & Google OAuth (enabled only when env keys exist), email verification optional, TOTP 2FA plugin, admin plugin (roles `user` / `admin`), API-key plugin (or own `api_keys` table if plugin unsuitable).
- **Email (optional):** `nodemailer` SMTP transport behind a `Mailer` interface; console mailer in dev.
- **Short codes:** `nanoid` `customAlphabet` (crypto-secure), base62 without look-alikes (`0OIl1`), default length 7.
- **Link passwords:** `@node-rs/argon2` (argon2id).
- **QR codes:** `qrcode` generated **on demand** (SVG + PNG route), never stored in DB.
- **UA parsing / bots:** `ua-parser-js` + `isbot`.
- **Geo:** pluggable `GeoResolver`: (1) trusted CDN headers (`cf-ipcountry`, `x-vercel-ip-country`, etc.) when `TRUST_PROXY_GEO_HEADERS=true`, (2) MaxMind GeoLite2 via `@maxmind/geoip2-node` when `GEOLITE2_DB_PATH` is set, (3) otherwise "Unknown". NO third-party HTTP lookups per click.
- **Rate limiting:** `RateLimiter` interface with an in-memory implementation (default, single instance) and a Redis implementation (`ioredis`) used when `REDIS_URL` is set.
- **Anti-abuse (optional):** Cloudflare Turnstile for anonymous creation when keys are set; domain blocklist; optional Google Safe Browsing check when `SAFE_BROWSING_API_KEY` is set.
- **Logging:** `pino` (pretty in dev, JSON in prod). **Env:** `@t3-oss/env-nextjs` + zod; app must fail fast on bad env.
- **Testing:** **Vitest** (unit + integration), **Testcontainers** (`@testcontainers/postgresql`) for repository integration tests, **Playwright** for E2E, `@testing-library/react` for components.
- **Quality:** ESLint (flat config, `next/core-web-vitals`, `typescript-eslint` strict), Prettier + `prettier-plugin-tailwindcss`, `lefthook` (or husky) + `lint-staged`, `commitlint` (conventional).
- **API docs:** OpenAPI 3.1 generated from zod (`zod-openapi` or `@asteasolutions/zod-to-openapi`), served at `/api/v1/openapi.json`, rendered at `/docs/api` (Scalar).

---

## 2. Architecture: Repository pattern + service layer (strict layering)

```
src/
  app/                         # Next.js routes ONLY (thin): pages, layouts, route handlers
    (marketing)/page.tsx       # landing + "shorten" box
    (auth)/sign-in, sign-up, forgot-password, two-factor
    (dashboard)/dashboard/     # links table, link detail/analytics, settings, api keys
    (admin)/admin/             # users, links, instance settings (admin role only)
    [code]/route.ts            # THE redirect handler (root-level short links)
    s/[code]/route.ts          # legacy compat → 308 to /[code]
    p/[code]/page.tsx          # password prompt page
    gone/[code]/page.tsx       # expired / limit reached / disabled page (themed)
    api/v1/...                 # public REST API (API-key auth)
    api/auth/[...all]/route.ts # Better Auth handler
    api/health/route.ts        # liveness + DB readiness
  components/                  # ui/ (shadcn), plus feature components
  features/
    links/   { schemas.ts, actions.ts, components/, hooks/ }
    analytics/{ schemas.ts, actions.ts, components/ }
    auth/, api-keys/, admin/
  server/
    db/            { client.ts, schema/*.ts, migrations/ }
    repositories/  # INTERFACES + Drizzle implementations
      link.repository.ts            (interface ILinkRepository)
      drizzle/link.repository.drizzle.ts
      click.repository.ts / drizzle/...
      api-key.repository.ts / drizzle/...
      settings.repository.ts / drizzle/...
      in-memory/*                   # fakes for unit tests
    services/      # business logic; depends ONLY on repository interfaces + ports
      link.service.ts, redirect.service.ts, analytics.service.ts,
      qr.service.ts, api-key.service.ts, abuse.service.ts
    ports/         # GeoResolver, RateLimiter, Mailer, Clock, CodeGenerator, PasswordHasher, UrlSafetyChecker
    adapters/      # concrete implementations of ports
    container.ts   # tiny composition root: builds repos/services once (no DI framework)
    errors.ts      # typed domain errors (NotFound, Conflict, Gone, Forbidden, ValidationError, RateLimited)
  lib/             # env.ts, logger.ts, utils.ts, constants.ts (RESERVED_CODES, limits)
tests/
  unit/ integration/ e2e/
```

Rules:
- Route handlers / server actions → call **services** only. Services → call **repository interfaces** and **ports** only. Only `server/repositories/drizzle/*` imports Drizzle.
- Services receive dependencies via constructor; `container.ts` wires real implementations; tests wire in-memory fakes.
- Domain errors map to HTTP status in ONE place (`server/http/error-mapper.ts`).
- Mark server-only modules with `import "server-only"`.

---

## 3. Data model (Drizzle, PostgreSQL)

Better Auth tables (user, session, account, verification, twoFactor, apikey as required by plugins), plus:

**links**
- `id` uuid pk (uuidv7 if available), `code` text **unique** (case-sensitive), `destination_url` text not null
- `user_id` → user (nullable for anonymous links), `title` text null
- `password_hash` text null (presence = protected)
- `expires_at` timestamptz null
- `max_clicks` int null, `click_count` int not null default 0 (counts successful redirects)
- `is_enabled` bool default true, `deleted_at` timestamptz null (soft delete; code stays reserved)
- OG overrides: `og_title`, `og_description`, `og_image_url` (must be an https URL, not base64)
- QR prefs: `qr_fg_color` default `#000000`, `qr_bg_color` default `#FFFFFF`
- `created_ip_hash` text null (for anon abuse tracing), `created_at`, `updated_at`
- indexes: `code` unique, `(user_id, created_at desc)`, `expires_at`

**clicks** (one row per redirect)
- `id` bigserial/uuid, `link_id` fk cascade, `occurred_at` timestamptz default now()
- `visitor_hash` text: `sha256(ip + userAgent + dailyRotatingSalt)`. **Never store raw IP.**
- `country` (ISO-2), `region`, `city`
- `browser`, `browser_version`, `os`, `os_version`, `device_type` (desktop/mobile/tablet/bot/other)
- `referrer_host` text, `referrer_url` text
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` (taken from the **short-link request's own query string**, then passed through to the destination)
- `language`, `is_bot` bool
- indexes: `(link_id, occurred_at)`, `(link_id, country)`, `(link_id, is_bot)`

**instance_settings** (single row): `allow_anonymous_links`, `allow_signups`, `anon_link_ttl_hours` (default 720), `blocked_domains` text[].
Env vars provide the defaults; the admin UI can override them.

**api_keys** (if not using the Better Auth plugin): `id`, `user_id`, `name`, `prefix`, `hash`, `last_used_at`, `created_at`, `revoked_at`.

---

## 4. Features (functional requirements)

### Link creation (dashboard form + landing-page quick box + API)
- Destination URL: zod-validated, **only `http:`/`https:`**, max 2,048 chars, reject the instance's own host (no redirect loops), reject blocked domains, optional Safe Browsing check.
- Custom code (optional): `^[A-Za-z0-9_-]{3,50}$`, case-sensitive, not in `RESERVED_CODES` (every top-level route segment: `api, s, p, gone, dashboard, admin, sign-in, sign-up, docs, _next, favicon.ico, robots.txt, sitemap.xml, health`, …). Return 409 if taken (including soft-deleted codes).
- Generated code: nanoid length 7; on unique-violation retry (max 5) then grow length by 1. Rely on the DB unique constraint, not a pre-check.
- Title (≤100), expiration presets `never | 10m | 1h | 6h | 12h | 24h | 48h | 7d | 30d | custom` (custom = date-time picker, must be in future, max 1 year), access limit presets `unlimited | 1 | 10 | 100 | 1000 | custom (1–100000)`, password (4–128 chars), OG title (≤70) / description (≤200) / image URL, QR colors.
- Anonymous creation (only when enabled): no password/analytics dashboard; forced TTL (`anon_link_ttl_hours`); stricter rate limit; Turnstile if configured; response includes a one-time "claim token" stored in localStorage so the user can claim links into an account after sign-up.
- Same destination twice: always create a NEW link (document this; no "dedupe" magic).

### Redirect: `GET /[code]` (route handler, the hot path; keep it lean)
Order of checks:
1. Look up by code (skip soft-deleted). Not found → 404 page.
2. Disabled → `/gone/[code]?reason=disabled`. Expired → `reason=expired` (HTTP 410 semantics on the page).
3. **Social/preview bots** (`isbot` + explicit list: facebookexternalhit, Twitterbot, LinkedInBot, Slackbot, Discordbot, TelegramBot, WhatsApp, Applebot, SkypeUriPreview, Pinterest): return a minimal HTML page with **fully escaped** OG/Twitter meta tags. **NEVER include the destination URL in this response if the link is password-protected**, and never include any `<script>` or meta-refresh to the destination. Bots do not consume access-limit and are recorded with `is_bot=true`.
4. Password-protected → 307 to `/p/[code]`.
5. Access limit: **atomic** `UPDATE links SET click_count = click_count + 1 WHERE id = $1 AND (max_clicks IS NULL OR click_count < max_clicks) RETURNING destination_url`. Zero rows → `/gone/[code]?reason=limit`.
6. Record the click **after responding** (Next `after()`), never blocking the redirect; failures logged, not thrown.
7. Respond with **302** (configurable `REDIRECT_STATUS=302|307`); **never 301/308** for short links (caching breaks expiry/limits/analytics). Set `Cache-Control: private, no-store`, `Referrer-Policy: unsafe-url` optional via env (default `strict-origin-when-cross-origin`).
8. Forward query string: `?utm_*` etc. on the short link are appended to the destination (configurable `FORWARD_QUERY_PARAMS=true`).

### Password page `/p/[code]`
- shadcn form, server action verifies with argon2, rate-limited per (IP, code) (e.g., 10 / 15 min) **and** per code globally (e.g., 100 / 15 min).
- On success: performs the same atomic access-limit consume + click record, then `redirect()` to the destination. Constant-time-ish responses; generic error messages.
- Legacy import support: if `password_hash` starts with `$2a$/$2b$`, verify with `bcryptjs` and transparently rehash to argon2.

### Dashboard (authenticated)
- Links data table (shadcn `DataTable` + TanStack Table): server-side pagination, search (code/title/destination), filters (active/expired/disabled/protected), sort by created/clicks; row actions: copy, QR, edit, enable/disable, delete (confirm dialog), view analytics.
- Edit link: title, destination, expiration, limit, password (set/change/remove), OG fields, QR colors, enabled. Code is immutable after creation.
- QR dialog: live preview, fg/bg color pickers, download PNG/SVG (`/api/v1/links/{id}/qr.{png|svg}` and public `/[code]/qr` optional via env).
- Bulk: select rows → disable / delete / export CSV.
- Overview page: total links, total clicks (7d/30d), top links, clicks sparkline.

### Analytics (per link; all aggregation in SQL, never in JS over raw rows)
- Range picker (24h, 7d, 30d, 90d, all, custom); toggle "include bots" (default off).
- KPI cards: total clicks, unique visitors (distinct `visitor_hash`), bot clicks, clicks this period vs previous period (% change).
- Charts (shadcn Charts): clicks over time (bucket by hour/day via `date_trunc`, zero-filled), weekday × hour heatmap, top countries (with flags), cities, devices (donut), browsers, OS, referrers (by host), UTM source/medium/campaign tables, languages.
- Recent clicks table (no IP).
- Export CSV of raw clicks for the range (streamed).
- Analytics only for link owner or admin.

### Accounts & settings
- Sign up / sign in / sign out / forgot + reset password (when SMTP configured), OAuth buttons only when configured, TOTP 2FA with backup codes, change password, delete account (cascade links), export my data (JSON).
- API keys page: create (show once), list with prefix + last used, revoke.
- First user to sign up becomes `admin` (or `ADMIN_EMAIL` env).

### Admin (role = admin)
- Instance settings (anonymous links on/off, signups on/off, anon TTL, blocked domains).
- Users list (ban/unban, role change), all links list (disable/delete abusive links), basic instance stats.

### Public REST API v1 (Bearer API key; same services, same zod schemas)
- `POST /api/v1/links`, `GET /api/v1/links` (cursor pagination), `GET|PATCH|DELETE /api/v1/links/{id}`, `GET /api/v1/links/{id}/stats?from&to`, `GET /api/v1/links/{id}/qr.{png|svg}`.
- Consistent error shape: `{ "error": { "code": "CONFLICT", "message": "...", "details"?: {...} } }`.
- Per-key rate limit, `X-RateLimit-*` headers. OpenAPI spec + Scalar docs page.

### UX & polish
- Landing page: hero + single input "Paste a long URL" → result card (copy button, QR, "open analytics" if signed in), features grid, self-host CTA, GitHub link.
- Fully responsive, accessible (labels, focus rings, keyboard nav, aria-live for copy/toast), dark mode, empty states, skeleton loaders, optimistic UI where safe.
- Themed 404 / gone / password pages; no references to the old brand.
- `SITE_URL` drives every absolute URL (short links, OG, QR); **nothing hard-coded**.
- SEO: metadata API, `robots.ts` (disallow short-link space), `sitemap.ts` for marketing pages only, OG image for the app via `opengraph-image.tsx`.

---

## 5. Security requirements (non-negotiable)
- Only http/https destinations; escape everything rendered in bot/OG HTML; strict CSP via headers (nonce-based for scripts), HSTS (configurable), `X-Content-Type-Options`, `frame-ancestors 'none'`.
- Client IP derived only via `TRUST_PROXY=true` + a configurable number of trusted hops; otherwise use the socket address. Document this.
- Store only hashed visitor identifiers; daily salt rotated, stored in DB/Redis.
- Rate limits: create (per user / per IP for anon), password attempts, auth endpoints (Better Auth built-in), API keys.
- Authorization checks in **services** (owner or admin), not just in UI. Every server action goes through `next-safe-action` auth middleware.
- CSRF: rely on Server Actions' origin check + Better Auth; API uses Bearer keys only (no cookies).
- Secrets only from env; `.env.example` documents every variable; no secrets in client bundles (`NEXT_PUBLIC_` only for safe values).

---

## 6. Environment variables (`.env.example`, all validated in `src/lib/env.ts`)
`DATABASE_URL`, `SITE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` (optional),
`SMTP_HOST/PORT/USER/PASS/FROM` (optional),
`ALLOW_ANONYMOUS_LINKS` (default false), `ALLOW_SIGNUPS` (default true), `ANON_LINK_TTL_HOURS` (720), `ADMIN_EMAIL` (optional),
`REDIRECT_STATUS` (302), `FORWARD_QUERY_PARAMS` (true), `PUBLIC_QR_ENDPOINT` (false),
`TRUST_PROXY` (false), `TRUSTED_PROXY_HOPS` (1), `TRUST_PROXY_GEO_HEADERS` (false), `GEOLITE2_DB_PATH` (optional),
`REDIS_URL` (optional), `TURNSTILE_SITE_KEY/SECRET_KEY` (optional), `SAFE_BROWSING_API_KEY` (optional),
`LOG_LEVEL` (info), `TELEMETRY_DISABLED` (Next telemetry note).

---

## 7. Deployment (Docker first)
- Multi-stage `Dockerfile` (deps → build → runner on `node:<lts>-alpine`, non-root user, `standalone` output, healthcheck hitting `/api/health`).
- Migrations run on container start via a small `scripts/migrate.ts` (drizzle migrator) before `server.js` (entrypoint script), guarded by an advisory lock.
- `docker-compose.yml`: `app` + `postgres:17` (volume, healthcheck) + optional `redis` profile; `.env` driven.
- `docker-compose.dev.yml` for local Postgres only.
- Publish image to **GHCR** via GitHub Actions on tags (`linux/amd64,linux/arm64`).
- Docs page `docs/self-hosting.md`: Docker, reverse proxy examples (Caddy + nginx), Coolify/Dokploy notes, GeoLite2 setup, backups (`pg_dump`), upgrading.

---

## 8. Open-source packaging
- `LICENSE`: **MIT**, `Copyright (c) <current year> Raydan Aridi`.
- `README.md`: logo/name, one-line pitch, screenshots placeholders, features list, quick start (Docker in 3 commands), local dev, env table, API example (curl), tech stack, architecture diagram (Mermaid), roadmap, contributing link, license badge, CI badge.
- `CONTRIBUTING.md` (setup, branch/commit conventions, how to add a repository/service, tests), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` (private disclosure via GitHub Security Advisories), `CHANGELOG.md` (managed by **release-please**).
- `.github/`: `ISSUE_TEMPLATE/` (bug, feature, config.yml), `PULL_REQUEST_TEMPLATE.md`, `dependabot.yml` (npm + actions + docker, grouped), `FUNDING.yml` placeholder, `CODEOWNERS`.
- Workflows: `ci.yml` (install with cache → lint → typecheck → unit → integration with Postgres service → build → Playwright E2E against built app), `release-please.yml`, `docker-publish.yml`, `codeql.yml`.
- `.editorconfig`, `.gitattributes`, `.gitignore`, `.nvmrc`, `.vscode/extensions.json`.
- `npm seed` script creating demo user + sample links + synthetic clicks for screenshots/dev.

---

## 9. Testing requirements
- **Unit (Vitest):** zod schemas (URL scheme rejection, reserved codes, limits), code generator, expiration math (inject `Clock`), services with in-memory repos (create, custom-code conflict, edit, delete, authorization), redirect decision logic (every branch incl. bot + password, bot never sees destination of protected link), OG HTML escaping, visitor hash, UA parsing, query forwarding.
- **Integration (Testcontainers Postgres):** each Drizzle repository; atomic access-limit under concurrency (fire 50 parallel consumes on `max_clicks=10`, assert exactly 10 succeed); analytics SQL aggregations with zero-filled buckets.
- **E2E (Playwright):** sign up → create link → visit short link → redirected (302) → analytics shows 1 click; password link flow; expired link shows gone page; access limit 1 → second visit gone; anonymous creation toggled on/off; API key create + `curl`-style API call; dark mode smoke.
- Coverage target ≥ 80% for `src/server/**`.

---

## 10. Optional: import from the legacy app
Provide `scripts/import-legacy.ts` that reads a JSON/CSV export with columns
`shortCode, originalUrl, title, clicks, isActive, expiresAt, createdAt, password(bcrypt hash), accessLimit, accessCount, metaTitle, metaDescription, metaImageUrl, qrCodeColor, userEmail`
and inserts links (mapping users by email if they exist, otherwise assigning to the admin). Base64 `metaImageUrl` values are dropped. Click history is not imported. Document how to export from SQLite with `sqlite3 -json`. Also keep the `/s/[code]` → `/[code]` 308 compatibility route so old printed links keep working.

---

## 11. Execution phases (commit after each, all checks green)
1. Scaffold: Next.js + TS strict + Tailwind v4 + shadcn init + ESLint/Prettier/lefthook/commitlint + Vitest + Playwright + env validation + pino + MIT LICENSE + base README.
2. DB: Drizzle schema, migrations, docker-compose.dev, container.ts, repository interfaces + Drizzle + in-memory impls, integration tests.
3. Auth: Better Auth (email/password, OAuth optional, 2FA, admin, sessions), auth pages, protected layouts, first-user-admin.
4. Links: schemas, services, server actions, create form, landing quick box, dashboard table, edit, delete, enable/disable, QR.
5. Redirect: `/[code]` handler, bot/OG handling, password page, gone pages, atomic limits, `after()` click recording, geo/UA/visitor-hash adapters, `/s/[code]` compat.
6. Analytics: SQL aggregations, analytics page with charts, CSV export, overview page.
7. API v1 + API keys + OpenAPI + Scalar docs + rate limiting.
8. Admin + instance settings + anonymous creation + Turnstile + blocklist + Safe Browsing.
9. Docker, compose, entrypoint migrations, health check, GHCR workflow, self-hosting docs.
10. OSS polish: README, CONTRIBUTING, CoC, SECURITY, templates, CI, release-please, dependabot, CodeQL, seed script, screenshots placeholders, legacy import script.

**Definition of done:** `npm install && npm lint && npm typecheck && npm test && npm build && npm test:e2e` all pass, and `docker compose up` on a clean machine gives a working instance at `SITE_URL`. A new user can sign up, shorten a link, open it, and see the click in analytics within seconds. Summarize anything you deferred in `ROADMAP.md`.

Verification

- The prompt file exists at the path above, and tool-suite has no git changes (git status is clean).
- Read the prompt against the "bugs found" list. Each bug has a matching requirement: http/https only, escaped OG HTML with no destination for protected links, 302 with no-store, atomic limits, nanoid with the DB unique constraint, QR on demand, SQL aggregation, hashed IPs, no hard-coded domain.
- The real end-to-end test is the "Definition of done" inside the prompt, run in the new repo.

  Ran 1 shell command

I'm doing well, thanks. I went through the repo and wrote the prompt to V:\Web Projects\In-Progress Projects\ToolWright.com\ToolWright-build-prompt.md (257 lines). I saved it next to tool-suite rather than inside it, and the old repo is unchanged.

Where the shortener lives now: almost all of it is in one 1,637-line file, packages/server/src/main.ts (lines 609–1477). The click tracking is in services/analyticsService.ts, and the frontend is spread across EnhancedURLShortener.tsx, ShortUrlRedirect.tsx and the two Analytics components. The other 28+ tools have nothing to do with it, so the prompt starts the new repo from scratch instead of copying code.

What the prompt asks for, based on your answers:
- Stack: Next.js (App Router), TypeScript, Tailwind v4 and shadcn/ui, with PostgreSQL and Drizzle for the database and Better Auth for logins. Tests use Vitest and Playwright.
- Structure: a repository pattern with a service layer, so database code stays separate from the logic and the logic can be tested with in-memory fakes.
- Features: everything your current shortener does — custom codes, expiry, password protection, visit limits, social-media previews, QR codes and detailed analytics. It also adds editing, search, CSV export, a public API with API keys, an admin panel, and anonymous link creation you can switch on or off.
- Open source: MIT license, README, contributing and security guides, CI, Docker and docker-compose files, automatic releases, and a script to import links from the old site.

Bugs in the old code the prompt tells the new build to avoid:
- Password bypass: anyone can skip a link's password by pretending to be a social-media bot (e.g. Facebook's), because that page shows the destination URL.
- XSS: javascript: links are accepted and written into the page unescaped.
- 301 redirects: browsers cache these permanently, so expiry, visit limits, disabling a link and analytics stop working after the first visit.
- Visit limits can be exceeded: the count is read and then written in two separate steps, so simultaneous visits slip past the limit. The password path doesn't count visits at all.
- QR code never appears: the create response leaves out the QR data.
- Privacy: full visitor IP addresses are stored, and every click calls an outside lookup service over plain HTTP.

To use it:
1. Make a new empty folder, for example ToolWright.
2. Open Claude Code in that folder.
3. Paste in the contents of ToolWright-build-prompt.md.

It builds in 10 phases with a commit after each one. "ToolWright" is a placeholder name, so change it at the top of the prompt if you want something else.