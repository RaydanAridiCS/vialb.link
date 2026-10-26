# Roadmap

Ideas and known gaps, roughly in priority order. Contributions are welcome:
open an issue to discuss before starting on anything large.

## Deferred from v0.1

These were consciously left out of the first release or only partially done:

- **Real `410` status for gone links.** `/{code}` redirects to the themed
  `/gone/{code}` page, which currently answers `200`. Rendering the page with a
  410 status needs either a route-handler-rendered page or a framework hook.
- **Better Auth rate-limit storage in Redis.** App rate limits use Redis when
  `REDIS_URL` is set, but Better Auth's own sign-in limiter is still in-memory per
  instance (configure `secondaryStorage`).
- **Data retention jobs.** Old `daily_salts` rows and very old clicks are never
  pruned automatically. Add a scheduled cleanup and a retention setting.
- **E2E coverage for 2FA, OAuth and password reset.** These flows are delegated to
  Better Auth and only manually tested.
- **Screenshots** in the README (placeholders for now; `npm run seed` generates demo data).
- **Cache Components / instant navigation.** Disabled because the nonce-based CSP
  needs per-request rendering. Revisit with hash-based CSP (SRI) once it's stable
  in Next.js.
- **Resend email verification** from the UI when `REQUIRE_EMAIL_VERIFICATION=true`.
- **Enforcing 2FA for admins** (instance setting).

## Shipped since v0.1 planning

- Per-link UTM builder in the link form
- Tags on links, tag filter in the dashboard, `tags` in the REST API
- CSV bulk import from the dashboard
- QR customizer: error correction levels, badge frame, SVG and high-res PNG downloads
- Link-in-bio pages (`/@handle`)
- Smart device and geo routing
- Social card studio (designed preview cards and app mock-ups)
- Launch hardening: pool settings, startup config warnings, Redis fail-open, Sentry (opt-in), encrypted backups

## Next

- Folders for links (tags and tag filtering shipped)
- REST endpoint for bulk import (`POST /api/v1/links/import` or a batch create); the dashboard import is shipped
- Centre logo on QR codes (needs a safe upload and storage story; error correction `H` is already the default)
- Filter links by tag in `GET /api/v1/links`
- Webhooks on click thresholds, expiry, limit reached
- "Preview before redirect" interstitial option
- Bio pages: REST API, page-view counts, uploaded pictures (with the QR centre logo and image-upload story below), a sitemap, admin moderation tools
- Smart routing: more conditions (language, time), A/B and percentage splits, CSV import columns
- Social cards: uploaded images, free colours and logos, a designed preview image for bio pages
- Sentry in the browser (needs a build-time public DSN that fits the prebuilt image), Turnstile on sign-up and sign-in
- Custom 404 / gone page branding per instance

## Later

- Custom domains (multiple short domains per instance, per-user domains)
- Teams / organizations with shared links and roles
- Internationalisation of the UI
- Click retention policies and aggregated rollups for very large instances
- Public, read-only stats pages per link (opt-in)
