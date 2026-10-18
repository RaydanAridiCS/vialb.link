# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org). From the first release on, this file
is maintained automatically by
[release-please](https://github.com/googleapis/release-please) from
[Conventional Commits](https://www.conventionalcommits.org).

## [0.1.1](https://github.com/RaydanAridiCS/vialb.link/compare/toolwright-v0.1.0...toolwright-v0.1.1) (2026-10-18)


### Features

* add shadcn UI components and utility configurations ([84befe7](https://github.com/RaydanAridiCS/vialb.link/commit/84befe7ee656b2f040a8f0ed68ab6952119c3511))
* add user account settings and profile management components ([14470a6](https://github.com/RaydanAridiCS/vialb.link/commit/14470a6ba6051f5c3d6b8e86def29a07443ab540))
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
- Dashboard: searchable/filterable links table, bulk disable/delete/CSV export, edit page, QR dialog (PNG/SVG, custom colours)
- Accounts: email + password, optional GitHub/Google OAuth, TOTP 2FA with backup codes, password reset (SMTP), data export, account deletion
- First user becomes admin; admin area with instance settings, user ban/role management and all links
- Anonymous link creation (optional) with forced TTL, stricter rate limits, Cloudflare Turnstile and claim tokens
- Domain blocklist and optional Google Safe Browsing checks
- REST API v1 with API keys, per-key rate limits, OpenAPI 3.1 document and Scalar reference
- Docker image (standalone, non-root, health check, migrations on start), Compose stack, GHCR publishing
- Legacy importer for links exported from the previous app; `/s/{code}` compatibility redirect
