# Retargeting pixels

Marketers who share someone else's page (a press article, a partner's product) still want to build an
audience from the people who click. A link with **pixels** sends visitors through a short page that asks
first, then runs the **Meta Pixel** and/or **Google tag** you added, then forwards them to the destination.

Open **Retargeting pixels** in the link form and enter your IDs.

```
visitor ──▶ /{code} ──▶ consent page ──(accept)──▶ Meta / Google tags run ──▶ destination
                            │
                            └──(decline, or GPC / DNT)──▶ destination, nothing loaded
```

## Switched off by default

Pixels contradict the privacy page's promise that visiting a short link sets no cookies, so an instance
has to opt in:

- `PIXELS_ENABLED=true` in the environment, or
- **Retargeting pixels** in the admin settings (_On_ / _Off_ / _Default_). The admin setting wins over the variable and
  takes effect within a few seconds.

While it is off, links with stored pixels redirect normally (the form says so). Switching it on also
changes the privacy policy and terms pages: they list the Meta and Google tags, the consent cookie and the
link owner's responsibility. **Review your own legal text before enabling it.** Use `https://` for
`SITE_URL`; a startup warning appears otherwise.

## What a link can carry

| Field         | Format                                        | Example           |
| ------------- | --------------------------------------------- | ----------------- |
| Meta Pixel ID | 8 to 20 digits                                | `123456789012345` |
| Google tag ID | `G-` (GA4), `AW-` (Google Ads), `GTM-` (Tags) | `G-ABCD1234`      |

Either or both. IDs are checked against these patterns when saved **and** again when the page is built, and
they travel in escaped `data-*` attributes read by a fixed script, so an ID can never become script text.
Google IDs are stored upper-case.

A link with pixels **cannot also have a password**. The password form forwards straight to the destination,
so the pixels would silently never run. Saving both answers a clear error; remove one first.

## What the visitor sees

1. **First visit.** A small page: _Before you continue_, naming the tags and the destination host, with
   **Accept and continue** and **Continue without tracking**. Nothing from Meta or Google has loaded yet.
2. **Accept.** The choice is saved in a first-party cookie `vialb_consent=granted` (6 months, `SameSite=Lax`,
   `Secure` on https). The tags load, and after they load (or after 1.5 seconds, whichever comes first, plus a
   short pause so the beacons leave) the visitor is forwarded.
3. **Decline.** `vialb_consent=denied` is saved and the visitor is forwarded at once.
4. **Later visits.** After _accept_, the page skips the question and runs the tags. After _decline_, the link is
   an ordinary `302` again.

Visitors who send **Global Privacy Control** (`Sec-GPC: 1`) or **Do Not Track** (`DNT: 1`) never see the page:
they get a plain redirect, whatever they chose before, and no cookie is set. Browsers without JavaScript get a
plain **Continue** link and no tags run. Link-preview bots (Slack, WhatsApp, X, ...) get the usual preview
page, never the pixel page.

The destination is the same one a plain redirect would use: smart-routing rules are applied first, the query
string is forwarded, and an access limit is spent exactly once per visit. The click is recorded when the
page is served, as for any link, so analytics count the visit even if the visitor declines or leaves.

## Security

The page has its own Content Security Policy, set by the redirect route:

- `script-src 'nonce-…' 'strict-dynamic'`: only our inline script runs, and the scripts it adds (the ad
  tags) are trusted through it. No `unsafe-inline`, no `unsafe-eval`.
- `connect-src` and `img-src` allow Meta's and Google's beacon hosts, `default-src 'none'`, `form-action 'none'`,
  `frame-ancestors 'none'`.
- A **Google Tag Manager** container can load arbitrary tags of its own. Those that need hosts outside the list
  above are blocked by this policy; use a `G-` or `AW-` tag if you need strict behaviour.
- The proxy (`src/proxy.ts`) does not put its own CSP on short-code responses, because it would replace the one
  the route sets. A test keeps the list of reserved top-level pages complete (`tests/unit/proxy.test.ts`), since
  that list is how the proxy tells a page from a short code.
- A stored value that cannot be rendered safely (a corrupted ID or a non-`http(s)` destination) falls back to a
  plain redirect: a bad pixel can never break the link.

## REST API

`pixels` is accepted on `POST /api/v1/links` and `PATCH /api/v1/links/{id}` and returned on every link.

```json
{ "url": "https://news.example/story", "pixels": { "meta": "123456789012345", "google": "G-ABCD1234" } }
```

On `PATCH`, leaving it out keeps the pixels, an object replaces them and `null` removes them. Invalid IDs, or
pixels together with a password, answer `400 VALIDATION_ERROR`.

## Not included (yet)

- Other platforms (TikTok, LinkedIn, Pinterest, Reddit) and custom events or conversion labels.
- A reusable pixel library per account: IDs are entered per link.
- Pixels on bio-page buttons or password-protected links.
- A consent banner shared across links; each visitor answers once per browser, for all pixel links.

## Implementation map

| Part                  | Where                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| IDs, consent, opt-out | `src/lib/pixels.ts`                                                                                                                   |
| Page and its CSP      | `src/server/lib/pixel-page.ts`                                                                                                        |
| Decision              | `RedirectService.pixelStep` (kind `pixel`), `src/app/[code]/route.ts`                                                                 |
| Validation            | `LinkService.cleanPixels`, `pixelsSchema` in `src/features/links/schemas.ts`                                                          |
| Instance switch       | `PIXELS_ENABLED`, `instance_settings.pixels_enabled`, `SettingsService`, admin settings form                                          |
| Storage and migration | `links.pixels` (jsonb), `0006_retargeting_pixels.sql`                                                                                 |
| Form                  | `components/pixels-section.tsx`                                                                                                       |
| Legal text            | `src/features/marketing/legal.ts`, privacy and terms pages                                                                            |
| Tests                 | `tests/unit/{pixels,redirect-pixels,pixel-page,proxy}.test.ts`, `tests/component/pixels-section.test.tsx`, `tests/e2e/pixels.spec.ts` |
