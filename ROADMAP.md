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

## Next

- Folders for links (tags and tag filtering shipped)
- CSV bulk import from the dashboard
- Webhooks on click thresholds, expiry, limit reached
- Link-in-bio / "preview before redirect" interstitial option
- Per-link UTM builder in the create form
- Custom 404 / gone page branding per instance

## Later

- Custom domains (multiple short domains per instance, per-user domains)
- Teams / organizations with shared links and roles
- Internationalisation of the UI
- Click retention policies and aggregated rollups for very large instances
- Public, read-only stats pages per link (opt-in)
