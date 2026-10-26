# Link-in-bio pages

Every account can have one public page at **`/@handle`**: a name, a picture, a short bio, social
icons and a list of buttons. It is meant for the single link you can put in an Instagram, TikTok or X
profile. Edit it under **Bio page** in the dashboard; the preview next to the form shows the page as
you type.

```
https://vialb.link/@alice
```

## What is on a page

| Part         | Rules                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Handle       | 3-30 characters: lowercase letters, digits and `_`. `@Alice` and `alice` are the same page. See [Handles](#handles). |
| Name         | Up to 60 characters. Without one, the page shows `@handle`.                                                          |
| Bio          | Up to 160 characters, line breaks kept. Shown as plain text, never as markup.                                        |
| Picture link | An `https://` link to an image. Without one, a circle with your initial is shown. Nothing is uploaded or stored.     |
| Look         | One of six fixed palettes (Paper, Ink, Forest, Ocean, Plum, Rose). Text is readable on every one (tested).           |
| Social links | Up to 10 round icons. See [Social links](#social-links).                                                             |
| Buttons      | Up to 30, in the order you set. See [Buttons](#buttons).                                                             |
| Badge        | A small "Powered by Vialb" credit at the bottom. On by default, off with one switch.                                 |
| Published    | A draft is only visible to you. Unpublished and unknown handles both answer `404`.                                   |

## Handles

- Stored lowercase and unique across the instance. Visiting `/@Alice` redirects to `/@alice`.
- The reserved short-code names (`admin`, `api`, `dashboard`, ...) and a few names that could pass for
  staff (`support`, `help`, `team`, `vialb`, ...) cannot be taken.
- The form checks availability when you leave the field. The server checks again when you save, so two
  people racing for a handle cannot both get it.
- Changing the handle is limited to 5 times per day. The old handle is free for anyone as soon as you move.
- A short code that merely starts with `u` (for example `/uxyz123`) is unaffected; only `/@name` is a bio page.

## Social links

Pick a network and type a **handle** (`@alice`) or paste a **link**. Handles are turned into profile
links for Instagram, TikTok, YouTube, X, GitHub, LinkedIn, Facebook and Twitch. Each network only
accepts its own hosts, so an "Instagram" icon can never point somewhere else (`instagram.com.evil.example`
is refused). Spotify needs a link. **Website** accepts any `http(s)` URL and **Email** a `mailto:` address.

A website is checked like any destination (domain blocklist, Safe Browsing). Brand icons come from
[simple-icons](https://simpleicons.org) (CC0); it has no LinkedIn mark, so that network shows a plain link icon.

## Buttons

A button is a **short link in disguise**. Adding one creates a hidden link behind it, and the page
points at `/{code}`, so the normal redirect runs and every click is recorded by the usual analytics
(country, device, referrer, ...). That also means a button gets everything a link has: destination
checks, expiry and access limits (set them on the link), password protection and QR codes.

How the hidden links are treated:

- They are **kept out of** the Links list, the tag filter, the REST API list and the "total links" number,
  so a ten-button page does not bury your real links.
- They are **kept in** your data export, and in the admin "all links" view for abuse review.
- They do not use your 60-links-per-hour creation budget. Buttons have their own limit of 60 per hour.
- Each one goes through the same destination checks as any link: only `http(s)`, no credentials,
  no links back to this instance, the admin domain blocklist, and Safe Browsing when configured.
- Removing a button, or the whole page, deletes its link (the short code stays reserved).
- Click counts are shown next to each button in the editor.

Visitors only see buttons whose link is **working**: a button whose link was disabled, has expired or has
used up its visit limit disappears from the public page (the editor marks it). A password-protected
button stays; the visitor meets the password page.

## Privacy and security

- All text is rendered as text. A bio or label like `<script>` is shown literally (tested).
- Outbound social links open in a new tab with `rel="noopener noreferrer nofollow ugc"`.
- The picture is loaded **from the address you give**. Whoever runs that server can see the IP address
  and browser of visitors who load your page, the same as any hot-linked image. Vialb sends no referrer
  with it. Prefer an image host you trust.
- A banned account's page answers `404`.
- Pages are indexable (`robots.txt` allows `/@...`); drafts and unknown names are `404` and never listed.
  Vialb does not publish a sitemap of bio pages.
- The page is rendered per request, like the rest of the app, so it works with the nonce-based CSP.

## URLs, internally

A folder named `@x` is a parallel-route slot in the Next.js App Router, so `/@handle` cannot be a route
folder. Instead `next.config.ts` rewrites `/@:handle` to the real page at `src/app/u/[handle]`, and
`src/proxy.ts` sends the internal `/u/handle` and the percent-encoded `/%40handle` back to `/@handle`
with a `308`, so each page has one address. `u` and `verify-email` are in the reserved short-code list.

## Not included (yet)

- A REST API for bio pages (the dashboard is the only editor for now).
- Page-view counts. A button click arrives from the instance's own address, so referrers cannot tell
  you which page it came from; use the per-button click counts.
- Uploaded pictures (needs a safe upload and storage story), custom colours, drag-and-drop reordering
  (use the arrows), a sitemap, custom domains, and admin moderation tools beyond disabling links or banning.

## Implementation map

| Part                       | Where                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Handle, social-link rules  | `src/lib/bio.ts`, palettes in `src/lib/palettes.ts`                                                                            |
| Tables and migration       | `src/server/db/schema/bio.ts`, `links.kind`, `0003_link_in_bio.sql`                                                            |
| Repository (+ in-memory)   | `src/server/repositories/{bio.repository.ts,drizzle/…,in-memory/…}`                                                            |
| Service                    | `src/server/services/bio.service.ts`, `LinkService.createManaged`                                                              |
| Server actions and schemas | `src/features/bio/{actions,schemas}.ts`                                                                                        |
| Page, editor, icons        | `src/features/bio/components/*`, `src/app/u/[handle]/page.tsx`, `/dashboard/bio`                                               |
| URL rewrite                | `next.config.ts` (`rewrites`), `src/proxy.ts`                                                                                  |
| Tests                      | `tests/unit/bio*.test.ts`, `tests/component/bio.test.tsx`, `tests/integration/bio.repository.test.ts`, `tests/e2e/bio.spec.ts` |
