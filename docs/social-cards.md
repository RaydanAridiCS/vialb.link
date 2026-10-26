# Social card studio

When a link is shared in WhatsApp, iMessage, Slack or X, the app shows a preview: a title, a short
description and an image. The **Social preview** section of the link form lets you set all three without
Photoshop, and shows mock-ups of how the result looks in those four apps.

## The three image choices

| Choice            | What happens                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------- |
| **No image**      | Title and description only (a small "summary" card on X).                                    |
| **Designed card** | Vialb draws a 1200×630 image from your choices. Nothing to upload, nothing to host.          |
| **Image link**    | An `https://` link to an image that is already online (what "Preview image URL" used to be). |

Only one is active at a time. If a link somehow has both, the image link wins.

## Designing a card

| Option           | Choices                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Layout           | **Plain** (accent bar), **Gradient** (soft diagonal wash), **Split** (colour panel on the right) |
| Colours          | The same six palettes as bio pages. They are fixed on purpose: every combination is readable.    |
| Headline         | Required, up to 80 characters. "Use the title" copies the link's title.                          |
| Subtitle         | Optional, up to 100 characters.                                                                  |
| Show the address | Puts the short link's host in the corner.                                                        |

Long text steps down in size first and is cut with "…" only as a last resort, so it never runs off the
card. The text is measured with the real widths of DejaVu Sans, so a headline of wide capital letters wraps
the same way everywhere.

The preview title and description are separate fields above the image choice: they are what the apps print
next to the image.

## What crawlers get

The card is served by Vialb itself at `/{code}/card` (a PNG). When a crawler fetches the link, the preview
page points `og:image` and `twitter:image` at it, with its size (`og:image:width/height`) and the headline as
alt text. The URL carries a fingerprint of the design (`/{code}/card?v=k2j9x`), so changing the design gives a
**new URL** and apps fetch the new image instead of a cached one.

- The card is **public**: crawlers fetch it without credentials. It is drawn from the design alone, so
  it shows only what you typed on it, never the destination. Password-protected links can have one.
- It answers `404` when the link has no card, or is not live (disabled, deleted, expired or used up).
- It is cached for a day by browsers and CDNs, and each design is drawn once per server process (the last 200 are kept in memory).
- Add `?download=1` to get it as a file. The form shows a "Download the saved card (PNG)" button.
- Apps cache previews on their side too. After you change a card, an app that already showed the link may
  keep the old image for a while; sharing the link in a fresh chat usually refreshes it.

## Fonts

The PNG is drawn with `sharp`, which needs a system font. The Docker image installs DejaVu Sans
(`fontconfig` and `ttf-dejavu`), and the layout is fitted to that font. If you run Vialb outside Docker,
install DejaVu too; with another font the text is simply a little narrower than planned, and still fits.
The live preview in the form uses whatever font your browser has, so letter shapes can differ slightly
from the PNG, but the line breaks are the same.

## The mock-ups

WhatsApp, iMessage, Slack and X are drawn from the same data a crawler would use (title, description,
image, the short link's host), with each app's habits for cutting text short, in light and dark. They are
**approximations**: the apps change their look now and then. They are there to catch a title that is too
long or an image that looks wrong, not to be pixel-exact.

## REST API

`POST /api/v1/links` and `PATCH /api/v1/links/{id}` accept `cardDesign`, and every link returns it
(`null` when there is none):

```json
{
  "url": "https://example.com/sale",
  "cardDesign": {
    "template": "gradient",
    "palette": "forest",
    "headline": "Spring sale starts Friday",
    "subline": "Up to 40% off",
    "showHost": true
  }
}
```

On `PATCH`, leaving the field out keeps the card and `null` removes it. Unknown templates or palettes, an
empty or over-long headline, and a non-boolean `showHost` answer `400 VALIDATION_ERROR`.

## Not included (yet)

- Uploading your own image (it needs a safe upload, storage and backup story; the image link covers hosted images).
- Free colours, custom fonts, logos and per-app image sizes.
- A designed preview image for bio pages (they share a title and bio only).

## Implementation map

| Part                    | Where                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Design, layout, SVG     | `src/lib/social-card.ts`, glyph widths in `src/lib/font-metrics.ts`, colours in `palettes.ts`                                   |
| PNG rendering and cache | `src/server/services/card.service.ts`, route `src/app/[code]/card/route.ts`                                                     |
| Preview tags            | `renderPreviewHtml` in `src/server/lib/html.ts`, `RedirectService.resolve`, `cardUrlFor`                                        |
| Validation              | `cardDesignSchema` in `src/features/links/schemas.ts`, `LinkService.cleanCard`                                                  |
| Storage and migration   | `links.card_design` (jsonb), `0005_social_cards.sql`                                                                            |
| Form and mock-ups       | `components/social-card-studio.tsx`, `components/social-previews.tsx`                                                           |
| Tests                   | `tests/unit/{social-card,card.service}.test.ts`, `tests/component/social-card-studio.test.tsx`, `tests/e2e/social-card.spec.ts` |
