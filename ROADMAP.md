# Roadmap

Ideas and known gaps, roughly in priority order. Contributions are welcome:
open an issue to discuss before starting on anything large.

## Deferred from v0.1

These were consciously left out of the first release or only partially done:

- **Better Auth rate-limit storage in Redis.** App rate limits use Redis when
  `REDIS_URL` is set, but Better Auth's own sign-in limiter is still in-memory per
  instance (configure `secondaryStorage`).
- **E2E coverage for 2FA, OAuth and password reset.** These flows are delegated to
  Better Auth and only manually tested.
- **Cache Components / instant navigation.** Disabled because the nonce-based CSP
  needs per-request rendering. Revisit with hash-based CSP (SRI) once it's stable
  in Next.js.

## Shipped since v0.1 planning

- Per-link UTM builder in the link form
- Tags on links, tag filter in the dashboard, `tags` in the REST API
- CSV bulk import from the dashboard
- QR customizer: error correction levels, badge frame, SVG and high-res PNG downloads
- Link-in-bio pages (`/@handle`)
- Smart device and geo routing
- Retargeting pixels (Meta, Google) behind a consent page
- Team workspaces with roles and invitations
- Folders, REST bulk import and tag/folder filters, A/B splits, moving links between workspaces
- Period comparison, per-day unique visitors, conversion goals, click retention
- Real 410 for gone links, preview-before-redirect page, branding for the 404 / gone pages, enforced admin 2FA, README screenshots
- Link health monitor, weekly report and broken-links emails, public stats pages, in-process job scheduler
- Social card studio (designed preview cards and app mock-ups)
- Launch hardening: pool settings, startup config warnings, Redis fail-open, Sentry (opt-in), encrypted backups

## Next

- Centre logo on QR codes (needs a safe upload and storage story; error correction `H` is already the default)
- Webhooks on click thresholds, expiry, limit reached
- Bio pages: REST API, page-view counts, uploaded pictures (with the QR centre logo and image-upload story below), a sitemap, admin moderation tools
- Smart routing: more conditions (language, time), CSV import columns
- Social cards: uploaded images, free colours and logos, a designed preview image for bio pages
- Sentry in the browser (needs a build-time public DSN that fits the prebuilt image), Turnstile on sign-up and sign-in

## Later

- Custom domains (multiple short domains per instance, per-user domains)
- Teams: per-workspace settings, audit log, SSO
- Internationalisation of the UI
- Aggregated rollups for very large instances (measured: not needed yet, see docs/retention.md)
