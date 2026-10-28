# Gone pages, preview page, branding and admin 2FA

Four small features that make an instance feel finished. Migration `0014_polish`.

## Real 410 for gone links

`GET /{code}` answers a disabled, expired or limit-reached link with **HTTP 410** and the page itself, straight from the
short URL (no redirect hop). Next 16 has no supported way to set a page's status, so the page is static HTML produced by a
route handler (`src/server/http/static-pages.ts`), the same way the 404 is.

| Situation                            | `GET` / `HEAD` | Notes                                                                   |
| ------------------------------------ | -------------- | ----------------------------------------------------------------------- |
| Disabled, expired, access limit used | `410`          | Crawlers get it too: the gone check comes before the link-preview page. |
| Unknown code, or a deleted link      | `404`          | Deleted links stay 404 so nobody can tell a code once existed.          |
| `/gone/{code}?reason=…`              | `410`          | Kept for old links and the password-unlock failure path.                |

Every response carries `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`. `HEAD` never consumes access.

## Preview before redirect

Per link, off by default (link edit page, "Preview page" card; `previewInterstitial` in the REST API). Visitors see a plain
page with the destination's host and full address and a **Continue** link, instead of being redirected at once. It is
script-free and has its own strict CSP.

- The click is recorded and access is consumed **when the page is shown**; "Continue" is an ordinary link, so there is no
  second request to count.
- The anchor uses `rel="noopener nofollow"` and a `referrerpolicy` attribute taken from `REFERRER_POLICY` (a Referrer-Policy
  header would be overridden by the app-wide one in `proxy.ts`).
- It cannot be combined with [retargeting pixels](retargeting-pixels.md) (both are interstitials). The form and the service
  refuse the combination.
- Password-protected links skip it: once the password is accepted the visitor is sent straight on.
- Bots still get the Open Graph preview, never the destination of a protected link.

## Branding for the 404 and gone pages

Admin page, "Branding" section (stored in `instance_settings.branding`). Everything is optional and validated on save:

| Field                                    | Rules                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Brand name                               | Up to 40 characters.                                                                 |
| Accent colour                            | `#RRGGBB`, with a contrast of at least 3 : 1 against white so buttons stay readable. |
| Logo                                     | An `https://` image address. Only then does that page's CSP allow `img-src https:`.  |
| 404 / gone message                       | Up to 200 characters, shown under the heading; control characters become spaces.     |
| Home button label (30) and address (500) | A path starting with `/` or an `http(s)` address, no credentials.                    |

Text is escaped everywhere it is rendered. The settings form shows a live preview. The Next.js `not-found` page uses the same
values, so a missing page inside the app and a missing short code look the same.

## Enforcing 2FA for administrators

`REQUIRE_ADMIN_2FA` (default `false`) or the admin page ("Admin two-factor authentication"). When on, an administrator who has not
enrolled is redirected from the admin area to **Settings → two-factor** and the admin server actions refuse them. Their normal
dashboard keeps working. Regular users are never affected.

Ways the setting cannot lock you out:

1. It cannot be turned on by an administrator who has not enrolled themselves.
2. `ADMIN_2FA_EMERGENCY_OFF=true` ignores the setting completely, so a locked-out admin can restart the app with it and turn
   the setting off (a startup warning reminds you to remove it afterwards). No database access is needed.
3. Administrators without a password (they sign in with GitHub or Google) are exempt: Better Auth can only enrol an
   authenticator app for accounts that have a password.

## Resending the verification email

With `REQUIRE_EMAIL_VERIFICATION=true`, a visitor who signs in before verifying sees a "Resend verification email" button
(60 second cooldown), the same button is on the profile page, and an expired link on `/verify-email` offers a fresh one by
address. This already existed; Stage 4 only covered it with component tests.
