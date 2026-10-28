# Public stats page

A link's owner can publish a read-only page with its numbers, for sharing with clients or the public.
**Opt-in per link**: on the link's edit page, switch on "Public stats page".

- The address is `/stats/<token>`, a random 128-bit token (not the short code). **Generate a new address**
  kills the old one immediately; turning the page off revokes it. Wrong, revoked and deleted tokens all
  answer the same 404.
- **Aggregates only**, last 30 UTC days, bots excluded: clicks, unique visitors (per day, see
  [analytics](analytics.md)), a daily chart, top countries, referrer hosts and device types. No recent
  clicks, visitor hashes, cities, UTM names, routing details or destination URL.
- `noindex, nofollow` (header, meta tag and `robots.txt`), `Referrer-Policy: no-referrer`, and the same
  nonce-based Content-Security-Policy as the rest of the app. `stats` is a reserved short code.
- Rate limited per visitor address (120 per minute).
- REST: `statsUrl` on the link; `PATCH { "publicStats": true | false }` switches it.
