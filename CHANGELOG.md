# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org). From the first release on, this file
is maintained automatically by
[release-please](https://github.com/googleapis/release-please) from
[Conventional Commits](https://www.conventionalcommits.org).

## [0.1.1](https://github.com/RaydanAridiCS/vialb.link/compare/vialb-v0.1.0...vialb-v0.1.1) (2026-10-28)


### Features

* add authentication system with email verification, reset templates, and UI views ([51b2b25](https://github.com/RaydanAridiCS/vialb.link/commit/51b2b257c96f241fbcb443b6596eff4d01a6a369))
* add authentication, database management, and deployment documentation for Vialb self-hosting ([6edd098](https://github.com/RaydanAridiCS/vialb.link/commit/6edd098dc716f3f54c6ad217370adee714cd3856))
* add CSV bulk import, tag organization, and advanced QR customization features ([cef3b96](https://github.com/RaydanAridiCS/vialb.link/commit/cef3b96ab4bb6881d238b5b2843f5dc16bf08525))
* add link form and UTM builder components with associated tests and gitignore updates ([9061321](https://github.com/RaydanAridiCS/vialb.link/commit/9061321fd23f2b7e89e0405c21e7ae7744e105b0))
* add link-in-bio features, smart routing, social cards, and comprehensive test suite ([ac4b102](https://github.com/RaydanAridiCS/vialb.link/commit/ac4b10252fc968d7357cebb4ce5dc2c11546d37a))
* add marketing pages, components, and API schema for the URL shortener app ([6979fd2](https://github.com/RaydanAridiCS/vialb.link/commit/6979fd29dc7b66ad7e00aeb6602b0604e24f58d0))
* add shadcn UI components and utility configurations ([84befe7](https://github.com/RaydanAridiCS/vialb.link/commit/84befe7ee656b2f040a8f0ed68ab6952119c3511))
* add unit tests for services and implement server container, auth config, and session handling ([e3e3310](https://github.com/RaydanAridiCS/vialb.link/commit/e3e3310a0dd213eee348b8fa997d36f28fc34c7e))
* add user account settings and profile management components ([14470a6](https://github.com/RaydanAridiCS/vialb.link/commit/14470a6ba6051f5c3d6b8e86def29a07443ab540))
* add workspaces, team management, retargeting pixels, and safe server actions infrastructure ([0c6fec7](https://github.com/RaydanAridiCS/vialb.link/commit/0c6fec7184c2adb64fb92873cd18d2a294d1e3d8))
* implement conversion tracking, analytics views, and click retention features ([f1c06c3](https://github.com/RaydanAridiCS/vialb.link/commit/f1c06c34db453c2f85d7bcd31a695f71ab8af56d))
* implement core services, database schema, and UI views for link management and redirects ([bbf4625](https://github.com/RaydanAridiCS/vialb.link/commit/bbf4625cce663c206e7673e70751334d78e6e06c))
* implement link folders, smart routing, and REST API v1 endpoints ([61411b9](https://github.com/RaydanAridiCS/vialb.link/commit/61411b9eed9fe6e5f7fda1c48451c2663ffd6bc1))
* implement link health monitoring, public stats, reporting, and database migrations ([df640a4](https://github.com/RaydanAridiCS/vialb.link/commit/df640a49ca92b5c2a13d86667158766d58c99b46))
* implement link management features, repositories, and UI components ([bc7afa0](https://github.com/RaydanAridiCS/vialb.link/commit/bc7afa0ec5d3a947e1c38cd0500a11fcae495337))
* initial project structure and core features for link management application ([d3cb674](https://github.com/RaydanAridiCS/vialb.link/commit/d3cb67459aff0c353a2f58f4ab1af1642044ecd9))
* initial project structure and core features for toolwright link shortener application ([99a68c4](https://github.com/RaydanAridiCS/vialb.link/commit/99a68c488f171d5f5c6787e217332070b1af81a1))
* initial project structure and implementation of core features, database schema, and API routes ([d49968d](https://github.com/RaydanAridiCS/vialb.link/commit/d49968d0cca6133dbd0df07e481aae7efed8593b))
* initialize core application structure, UI components, and layout views ([701909e](https://github.com/RaydanAridiCS/vialb.link/commit/701909ed7a1685c27e87e2dd807a8472da7e23a9))
* initialize full-stack application with link management, authentication, and analytics features ([992ec0a](https://github.com/RaydanAridiCS/vialb.link/commit/992ec0ab034448f570247a1c3907d87e92f59134))
* initialize Next.js project structure and documentation ([4a7904d](https://github.com/RaydanAridiCS/vialb.link/commit/4a7904d9fc157b1fc832b93f3341a967aa3f28ef))

## 0.1.0 (unreleased)

### Features

- Short links with generated (nanoid, look-alike-free base62) or custom case-sensitive codes
- Expiration presets and custom dates, atomic access limits, argon2id password protection
- Link-preview (Open Graph / Twitter) overrides with fully escaped bot HTML; protected destinations never leak
- 302/307 redirects with `no-store`, UTM/query forwarding and click recording after the response
- Privacy-friendly analytics: hashed visitor IDs with a daily salt, geo via CDN headers or GeoLite2, UA/bot parsing,
  SQL aggregations (zero-filled time series, weekday × hour heatmap, top countries/cities/devices/browsers/OS/referrers/UTM/languages), CSV export
- Link tags: normalized lowercase labels (max 10 per link), chip input in the link form, tag filter and pills in the
  links table (also in the admin view), `tags` on the REST API (create, update, response); migration `0001_link_tags`
- UTM campaign builder in the link form: presets, live preview, applies `utm_*` parameters to the long URL
- CSV bulk import from the dashboard: drag and drop, column detection (Bitly/TinyURL/Excel aliases), preview with per-row validation,
  batched import with progress, summary with a downloadable error CSV, safe re-imports and its own rate-limit budget
- QR customizer: error correction `L`/`M`/`Q`/`H` (new links default to `H`), "Scan me" badge frame with editable text, SVG, PNG and
  high-res PNG downloads that match the live preview, contrast and inverted-colour warnings; `qrEcc`, `qrFrame`, `qrFrameText` on the REST API;
  migration `0002_qr_options`
- Dashboard: searchable/filterable links table, bulk disable/delete/CSV export, edit page, QR dialog (PNG/SVG, custom colours)
- Accounts: email + password, optional GitHub/Google OAuth, TOTP 2FA with backup codes, password reset (SMTP), data export, account deletion
- First user becomes admin; admin area with instance settings, user ban/role management and all links
- Anonymous link creation (optional) with forced TTL, stricter rate limits, Cloudflare Turnstile and claim tokens
- Domain blocklist and optional Google Safe Browsing checks
- REST API v1 with API keys, per-key rate limits, OpenAPI 3.1 document and Scalar reference
- Docker image (standalone, non-root, health check, migrations on start), Compose stack, GHCR publishing
- Legacy importer for links exported from the previous app; `/s/{code}` compatibility redirect
- Link-in-bio pages at `/@handle`: picture, bio, six fixed palettes, social icons (host-checked), up to 30 reorderable buttons that are
  real hidden links (clicks counted, kept out of the links list), draft/published, "Powered by" badge off-switch; migration `0003_link_in_bio`
- Smart device and geo routing: ordered rules per link (iPhone / Android / desktop, countries, or both), a "try a visitor" box in the form,
  a "Smart routing" card in analytics, `routingRules` on the REST API; migration `0004_smart_routing`
- Social card studio: designed 1200×630 preview cards (three layouts, six palettes) served at `/{code}/card`, mock-ups for WhatsApp, iMessage,
  Slack and X, `og:image` size and alt tags, `cardDesign` on the REST API; migration `0005_social_cards`
- Retargeting pixels: a Meta Pixel and/or Google tag per link, run from a consent page (off by default, instance switch `PIXELS_ENABLED`,
  honours Global Privacy Control and Do Not Track, remembers the choice for 6 months), its own CSP, privacy and terms text that follows the
  switch, `pixels` on the REST API; migration `0006_retargeting_pixels`
- Team workspaces: shared links, analytics and API keys with owner / admin / editor / viewer roles, invitations by email (7-day links tied to the
  invited address, copyable when SMTP is off), a workspace switcher, a Teams page, read-only screens for viewers, and an account-deletion guard so a
  team is never left without an owner; everyone gets a personal workspace (migration `0007_workspaces` moves existing links and keys into it)
- Short-code responses now keep the redirect route's own Content-Security-Policy (the proxy used to replace it, including the bot preview's)
- Production hardening: `DATABASE_POOL_MAX` / `DATABASE_PREPARE` (PgBouncer), Redis rate limiter that fails open, startup warnings for
  risky configuration, optional server-side error reporting (`SENTRY_DSN`, with query strings, cookies and SQL parameters stripped),
  encrypted daily backups to S3 / Cloudflare R2 (`backup` compose profile), and `no-store` on the legacy `/s/{code}` redirect
- In-process job scheduler (`job_runs`, compare-and-set leases so restarts and replicas never double-run; `JOBS_ENABLED`) and the link health
  monitor: SSRF-safe HEAD/GET checks of destinations and routing targets with a per-host gap, concurrency cap, consecutive-failure threshold,
  Safe Browsing hits, a "Needs attention" badge, filter, re-check and dismiss, `health` on the REST API (off by default); migration `0008_link_health`
- Weekly report and broken-links emails to workspace owners and admins (instance switch and send day/hour, per-person opt-out in settings,
  "send me a preview", idempotent `email_deliveries` ledger, HTML and plain text); migration `0009_weekly_reports`
- Public read-only stats page per link at `/stats/<token>` (opt-in, rotatable, aggregate-only, noindex, `statsUrl` / `publicStats` on the REST API);
  migration `0010_public_stats`
- Analytics: "compare to previous period" (change per row, dashed previous-period line, KPI deltas, `compare=0` to turn off) and unique visitors
  labelled honestly as per-day, with a per-bucket trend and [docs/analytics.md](docs/analytics.md) on what the number can and cannot say
- Click retention: `CLICK_RETENTION_DAYS` / admin setting (default keep forever, with a live "would delete N clicks" preview), a daily `retention`
  job that deletes in batches, daily salts always pruned after two days, BRIN index on `clicks.occurred_at`, a "Background jobs" panel with run-now,
  and `npm run bench:retention` (no rollup table was needed); migration `0011_click_retention`
- Conversion goals: opt-in per link, a random per-click `vclid` added to the destination, a browser snippet and a postback endpoint at `/api/convert`
  (no cookies, one conversion per click, time window, value/currency validation, rate limits), conversions / rate / value in analytics with a
  breakdown by route, country and device, CSV columns and `conversionsEnabled` on the REST API; migration `0012_conversions`
- Folders: a flat, single-parent grouping per workspace (create / rename / delete, filter, bulk "Move to folder", a field in the link form, `folder` column
  in the CSV import, deleting a folder keeps its links), `folderId` / `folder` and `/api/v1/folders` in the REST API; migration `0013_folders`
- REST API: `GET /api/v1/links` filters by `tag` and `folder`; `POST /api/v1/links/import` creates up to 100 links with a result per row and safe retries
- A/B and percentage splits inside smart-routing rules (2 to 5 weighted destinations, deterministic per visitor and day without cookies, no-condition
  A/B rules, variant recorded with each click, "A/B test" results table with planned and actual share and conversion rate); no migration
- Real `410 Gone` for disabled, expired and limit-reached links (also for `HEAD` and crawlers), served from the short URL itself;
  `/gone/{code}` keeps working; deleted and unknown codes stay `404`
- Optional per-link "preview before redirect" page (`previewInterstitial`, not combinable with pixels); migration `0014_polish`
- Instance branding (name, accent colour, logo, messages, home button) for the 404 and gone pages, with a live preview in the admin page
- `REQUIRE_ADMIN_2FA` / admin setting to require two-factor authentication for administrators, with a self-unlock path (`ADMIN_2FA_EMERGENCY_OFF`)
- README screenshots in light and dark, generated by `npm run screenshots` from the demo seed (`npm run seed` now also creates folders,
  an A/B test with conversions and a flagged link)
- Move links between workspaces (owner or admin of both, up to 100, keeps code, clicks, stats address and health, leaves the folder)
