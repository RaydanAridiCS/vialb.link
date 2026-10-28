# Link health monitor

A background job periodically requests where each link points and flags the ones that stopped working,
so a campaign does not quietly send people to an error page. **Off by default** (`HEALTH_MONITOR_ENABLED`,
or the "Link health monitor" setting in the admin page).

## What is checked

Enabled, not deleted, not expired, not out of visits, **no password**, owned by a workspace. For each link:
the destination and every smart-routing target (split targets are added with A/B splits). Bio-page buttons
are skipped. Healthy links are checked every `HEALTH_CHECK_INTERVAL_HOURS` (24); a failing one is retried
hourly. Editing the destination or routing wipes the record so the new target starts clean.

## What counts as broken

| Reason                                 | Meaning                                                             |
| -------------------------------------- | ------------------------------------------------------------------- |
| `not_found`                            | HTTP 404 or 410                                                     |
| `server_error`                         | HTTP 5xx                                                            |
| `timeout`                              | No answer within 8 seconds in total                                 |
| `redirect_loop` / `too_many_redirects` | Loops, or more than 5 redirects                                     |
| `dns`                                  | The domain does not resolve                                         |
| `tls`                                  | Certificate problem                                                 |
| `blocked_target`                       | Points at a private or disallowed address                           |
| `network`                              | Refused or reset connection                                         |
| `unsafe`                               | Google Safe Browsing hit (only when `SAFE_BROWSING_API_KEY` is set) |

**401, 403 and 429 are not failures**: many sites answer bots that way while working for people.
A link is flagged after `HEALTH_FAILURE_THRESHOLD` (3) **consecutive** failures; one success resets the
count. A Safe Browsing hit is authoritative and flags immediately.

## Politeness and safety

- At most 5 hosts at a time, at least 1 second between requests to the same host, 50 links per pass.
- HEAD first, GET on any HEAD failure; the body is never read. `User-Agent: Vialb-LinkHealth/1.0 (+SITE_URL)`.
- **SSRF protection:** loopback, private, link-local (including cloud metadata), CGNAT, multicast, reserved
  and IPv6 forms that embed an IPv4 address are refused (`src/lib/ip-guard.ts`). Names are resolved by the
  socket itself and every answer is checked **when it connects**, so DNS rebinding cannot swap in an internal
  address. Every redirect hop is checked again. Local names (`localhost`, `*.local`, single-label names) are refused.
- `HEALTH_ALLOW_PRIVATE_TARGETS=true` turns the address checks off (intranet deployments, local tests); a
  startup warning appears in production.

## In the dashboard

A **Needs attention** badge with the reason and the last check time, a filter ("Any destination health" /
"Needs attention"), and per link **Re-check** (counts as a real check, rate limited to 20 per 10 minutes) and
**Dismiss warning** (hidden until the link recovers and fails again). The edit page has a status card.
`GET /api/v1/links/{id}` returns `health` (`null` if never checked). Flagged links also appear in the
weekly [broken-links email](reports.md).

## Data

One row per link in `link_health` (latest state and the last 10 results as a JSON array). Nothing about
visitors is involved.

## Limits

One server cannot know whether a site is down for everyone (geo-blocking, bot walls), which is why the
threshold and the dismiss button exist.
