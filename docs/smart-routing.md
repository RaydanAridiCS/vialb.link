# Smart routing

One short link, several destinations. A mobile app can print a single QR code that opens the App Store
on an iPhone, Google Play on an Android phone and the marketing site on a laptop. A shop can send
visitors from Germany to its `.de` store.

Open **Smart routing** in the link form, add rules and use **Try it** to see where a visitor would go.

## How a rule works

A rule says _if the visitor is on this device and/or in these countries, send them to this URL_.

| Part      | Values                                                                                     |
| --------- | ------------------------------------------------------------------------------------------ |
| Device    | **iPhone & iPad** (`ios`), **Android** (`android`), **Desktop** (`desktop`), or any device |
| Countries | Two-letter ISO codes such as `US, CA, DE` (typed in any case), or none                     |
| URL       | Where matching visitors go. `http://` or `https://`                                        |

- A rule needs a device, a country, or both. When it has both, **both** must match.
- Rules are checked **in order and the first match wins**. Put the specific ones first: a broad rule
  above a narrow one hides it.
- A visitor who matches nothing goes to the link's normal **long URL**.
- Up to **10 rules** per link and 50 countries per rule. Two rules with the same conditions are refused,
  because the second could never be used.
- The query string of the short link (`?utm_source=qr`) is forwarded to whichever destination is chosen,
  exactly as it is for the long URL (unless `FORWARD_QUERY_PARAMS=false`).
- Expiry, access limits and password protection apply to the link, not to a rule. One visit uses one
  access whichever destination it goes to, and a password is asked before any routing happens.

## How the device is detected

From the `User-Agent` header:

| Visitor                                                     | Platform  |
| ----------------------------------------------------------- | --------- |
| iPhone, and iPad running iPadOS 12 or older                 | `ios`     |
| Any Android phone or tablet                                 | `android` |
| Windows, macOS, Linux, ChromeOS                             | `desktop` |
| Bots, link-preview crawlers, smart TVs, consoles, no header | none      |

**iPadOS 13 and newer** sends a Mac `User-Agent` in Safari, so those iPads count as `desktop`. If iPad
visitors matter, point the desktop rule somewhere that also works on an iPad (for example your website,
which can show its own App Store button). Visitors Vialb cannot place only match rules that have no device.

## How the country is found

Vialb never calls a third-party geolocation service. The country comes from the same local sources as
analytics, and **you need at least one of them** for country rules to do anything:

- **A CDN header**: run behind Cloudflare (or another CDN that sets a country header) and set
  `TRUST_PROXY_GEO_HEADERS=true`. Only turn this on behind such a CDN, otherwise anyone could spoof the header.
- **A GeoLite2 database**: set `GEOLITE2_DB_PATH`. See [self-hosting](self-hosting.md#geolite2-country--city-analytics).

If the country is unknown (neither is set, or the address is not in the database), country rules are
**skipped** and device-only rules still work. The lookup is local and only runs for links that have a
country rule, so other links pay nothing. A failing lookup never breaks a redirect.

## Previews and crawlers

Link-preview crawlers (Slack, WhatsApp, X, ...) always get the link's normal preview with the
**long URL's** details. They are never routed, and the rule targets are never listed in the preview HTML.

## Safety

Every rule target goes through the same checks as the long URL when you save it: only `http(s)`, no
credentials, no links back to this instance, the admin domain blocklist and (if configured) Google Safe
Browsing. The failing rule is named in the error ("Rule 2: ..."). When you edit a link, only targets that
are new are checked again.

## Analytics

Each click stores **which rule sent the visitor** (`routed_by`), never the rule's URL:

| Label                       | Meaning                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `ios`, `android`, `desktop` | A device rule matched                                       |
| `country:FR`                | A country rule matched (the visitor's country)              |
| `android+country:DE`        | A rule with both matched                                    |
| `default`                   | The link has rules, but none matched                        |
| _(empty)_                   | The link has no rules (and clicks from before this feature) |

The link's analytics page shows a **Smart routing** card with these as readable bars (for example
"iPhone & iPad · Germany"). It only appears for links that have routed clicks.

## REST API

`POST /api/v1/links` and `PATCH /api/v1/links/{id}` accept `routingRules`, and every link returns it:

```json
{
  "url": "https://app.example.com",
  "routingRules": [
    { "platform": "ios", "url": "https://apps.apple.com/app/id1" },
    { "platform": "android", "url": "https://play.google.com/store/apps/details?id=app" },
    { "countries": ["DE", "AT"], "url": "https://app.example.com/de" }
  ]
}
```

On `PATCH`, leaving the field out keeps the rules, an array replaces them and `[]` removes them.
Invalid rules answer `400 VALIDATION_ERROR` with the reason.

## Not included (yet)

- Imported (CSV) links have no rules; add them afterwards.
- Other conditions (language, time of day, browser), A/B or percentage splits, and rule-level limits.
- Per-rule QR codes. The QR code of a link points at the short link, which does the routing.
- Matching iPads that pretend to be Macs.

## Implementation map

| Part                     | Where                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matching, limits, labels | `src/lib/routing.ts` (shared by the server, the API schemas and the form's tester)                                                                                     |
| Device detection         | `detectPlatform` in `src/server/lib/user-agent.ts`                                                                                                                     |
| Redirect path            | `RedirectService.route`, `src/app/[code]/route.ts`, `src/features/links/unlock-action.ts`                                                                              |
| Validation               | `LinkService.cleanRouting`, `routingRulesSchema` in `src/features/links/schemas.ts`                                                                                    |
| Storage and migration    | `links.routing_rules` (jsonb), `clicks.routed_by`, `0004_smart_routing.sql`                                                                                            |
| Form and analytics UI    | `components/routing-rules.tsx`, the "Smart routing" card in `analytics-view.tsx`                                                                                       |
| Tests                    | `tests/unit/{routing,redirect-routing}.test.ts`, `tests/component/routing-rules.test.tsx`, `tests/integration/routing.repository.test.ts`, `tests/e2e/routing.spec.ts` |
