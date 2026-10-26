# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org). From the first release on, this file
is maintained automatically by
[release-please](https://github.com/googleapis/release-please) from
[Conventional Commits](https://www.conventionalcommits.org).

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
