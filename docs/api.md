# REST API v1

- **Interactive reference:** `/docs/api` on your instance (Scalar)
- **OpenAPI 3.1 document:** `/api/v1/openapi.json`, generated from the same zod
  schemas the API validates with.

## Authentication

Create a key in **Dashboard → API keys** and send it as a Bearer token:

```http
Authorization: Bearer tw_…
```

Keys act on behalf of their owner, **in the workspace they were created in** and with the owner's role there
(see [Teams](teams.md)): a viewer's key can read but not change anything, and a key stops working when its owner
leaves that workspace. Only a hash is stored, so a lost key can't be
recovered; revoke it and create a new one. Cookies are never accepted by the API.

## Rate limits

120 requests per minute per key. Every response includes:

| Header                  | Meaning                                    |
| ----------------------- | ------------------------------------------ |
| `X-RateLimit-Limit`     | Requests allowed in the window             |
| `X-RateLimit-Remaining` | Requests left                              |
| `X-RateLimit-Reset`     | Unix time (seconds) when the window resets |

Exceeding the limit returns `429` with a `Retry-After` header.

## Errors

All errors share one shape:

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "This short code is already taken",
    "details": { "field": "customCode" }
  }
}
```

| Status | `code`                                              |
| ------ | --------------------------------------------------- |
| 400    | `VALIDATION_ERROR` (zod issues in `details.issues`) |
| 401    | `UNAUTHORIZED`                                      |
| 403    | `FORBIDDEN`                                         |
| 404    | `NOT_FOUND`                                         |
| 409    | `CONFLICT`                                          |
| 429    | `RATE_LIMITED`                                      |
| 500    | `INTERNAL_ERROR`                                    |

## Endpoints

| Method   | Path                                   | Description                                                          |
| -------- | -------------------------------------- | -------------------------------------------------------------------- |
| `POST`   | `/api/v1/links`                        | Create a link                                                        |
| `GET`    | `/api/v1/links?cursor=&limit=`         | List your links (newest first, cursor pagination, `limit` ≤ 100)     |
| `GET`    | `/api/v1/links/{id}`                   | Get a link                                                           |
| `PATCH`  | `/api/v1/links/{id}`                   | Update a link (`null` clears optional fields; the code is immutable) |
| `DELETE` | `/api/v1/links/{id}`                   | Delete (soft) a link; its code stays reserved                        |
| `GET`    | `/api/v1/links/{id}/stats?from&to`     | Aggregated stats (humans only, default last 30 days)                 |
| `GET`    | `/api/v1/links/{id}/qr.png` / `qr.svg` | QR code (`?fg=&bg=&size=512&ecc=H&frame=badge&frameText=Scan%20me`)  |

Two fields on a link come from background features:

- `health`: result of the last destination check (`state`, `needsAttention`, `reason`, `statusCode`,
  `failingTarget`, `lastCheckedAt`), or `null` when never checked / the monitor is off. See [Link health](link-health.md).
- `statsUrl`: address of the [public stats page](public-stats.md) or `null`. `PATCH` with
  `{"publicStats": true}` turns it on (keeping the address), `false` turns it off.

## Examples

```bash
export TW=https://go.example.com
export KEY=tw_your_key

# Create
curl -X POST "$TW/api/v1/links" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{
        "url": "https://example.com/a/very/long/path",
        "code": "launch",
        "title": "Launch page",
        "tags": ["promo", "client-work"],
        "expiresAt": "2026-12-31T23:59:59Z",
        "maxClicks": 1000,
        "password": "s3cret"
      }'

# List (follow nextCursor for the next page)
curl "$TW/api/v1/links?limit=50" -H "Authorization: Bearer $KEY"

# Update: disable + remove the password
curl -X PATCH "$TW/api/v1/links/<id>" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"isEnabled": false, "password": null}'

# Stats for a custom range
curl "$TW/api/v1/links/<id>/stats?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z" \
  -H "Authorization: Bearer $KEY"

# QR code (uses the design saved on the link; every parameter is an optional override)
curl -o qr.png "$TW/api/v1/links/<id>/qr.png?size=1024" -H "Authorization: Bearer $KEY"
curl -o qr.svg "$TW/api/v1/links/<id>/qr.svg?frame=badge&frameText=Scan%20to%20order&ecc=H"   -H "Authorization: Bearer $KEY"
```

QR design is part of the link: `qrFgColor`, `qrBgColor`, `qrEcc` (`L`, `M`, `Q`, `H`), `qrFrame`
(`none`, `badge`) and `qrFrameText` (up to 24 characters; `null` on `PATCH` resets to "Scan me").
They are accepted by `POST`/`PATCH` and returned on every link. New links default to
`qrEcc: "H"`, `qrFrame: "none"`; links created before these options existed keep `"M"`.
Colour pairs that no scanner can read (contrast ratio below 2) are rejected with
`400 VALIDATION_ERROR`; the QR endpoints reject unknown `ecc` or `frame` values the same way.
`size` (PNG only) is clamped to 128-2048. See [CSV import and QR codes](import-and-qr.md).

Smart routing and social cards are part of the link too, and returned on every link:

- `routingRules`: up to 10 ordered rules, each with a `platform` (`ios`, `android`, `desktop`), `countries`
  (ISO codes) or both, and a `url`. The first matching rule replaces `url` for that visitor. On `PATCH`,
  omit the field to keep the rules, send an array to replace them, `[]` to remove them.
  See [Smart routing](smart-routing.md).
- `cardDesign`: `{ template, palette, headline, subline, showHost }` for a designed 1200×630 preview image
  served at `/{code}/card`, or `null`. On `PATCH`, omit to keep, `null` to remove.
  See [Social card studio](social-cards.md).

- `pixels`: `{ meta?, google? }` Meta Pixel and Google tag IDs, or `null`. Visitors see a consent page before the tags
  run, only while the instance has pixels enabled, and not on password-protected links. On `PATCH`, omit to keep,
  `null` to remove. See [Retargeting pixels](retargeting-pixels.md).

Invalid rules, card designs or pixels answer `400 VALIDATION_ERROR`. Rule targets are checked like `url`
(blocklist, Safe Browsing), and a message such as `Rule 2: ...` names the rule.

Tags are lowercase labels (up to 10 per link, 30 characters each: letters, numbers,
`-` or `_`). `#Promo` and `Client Work` are stored as `promo` and `client-work`.
`PATCH` with `tags` replaces all tags (`[]` clears them); omit the field to keep them.
Filtering by tag is available in the dashboard (`/dashboard/links?tag=promo`).

Creating a link for a destination you shortened before always creates a **new**
link; there is no implicit de-duplication.
