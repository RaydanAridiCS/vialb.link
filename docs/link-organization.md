# Organizing and tracking links

Two dashboard features help you manage many links and measure campaigns: **tags**
and the **UTM campaign builder**. Both live in the link form
(`/dashboard/links/new` and `/dashboard/links/{id}/edit`).

## Tags

Tags are short lowercase labels (`promo`, `client-work`, `menus`) used to group and
filter links.

### Rules

| Rule               | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| Tags per link      | at most 10 (`LIMITS.tagsPerLinkMax`)                                   |
| Length             | at most 30 characters (`LIMITS.tagMaxLength`)                          |
| Allowed characters | letters, numbers, `-` and `_`; must start with a letter or number      |
| Normalization      | lowercased, leading `#` removed, spaces become `-`, duplicates dropped |
| Scope              | tags belong to a link; there is no separate tag table or tag colour    |

`#Client Work` and `client work` are both stored as `client-work`. The rules live in
one place, `src/lib/tags.ts`, and are applied by the form schema, the REST API schemas
and `LinkService` (which is the authority: it re-validates and throws a
`ValidationError` with `field: "tags"`).

Colors in the UI are derived from the tag text (`tag-badge.tsx`, cool hues only), so
the same tag always looks the same without storing anything.

### In the dashboard

- **Link form:** a chip input. Enter or comma adds a tag, Backspace on an empty field
  removes the last one, leaving the field commits what you typed. Tags you already use
  are suggested.
- **Links table:** tag pills on every row. Clicking a pill filters the list; clicking
  it again clears the filter. An **All tags** dropdown in the toolbar does the same.
  The filter is stored in the URL (`/dashboard/links?tag=promo`), so it can be
  bookmarked and combined with search, status and sort.
- **Admin → All links:** the same filter, across every user's tags.
- **Bulk "Export CSV"** from the table includes a `tags` column (space separated).

An invalid tag typed into the field (for example `bad;tag`) stays in the box, the field is
marked invalid (`aria-invalid`) and a message explains why (`role="alert"`: letters, numbers,
`-` and `_` only; too long; or the 10-tag limit). The message clears as soon as you edit the
text. When several tags are pasted at once (`a,b,bad;one,c`), the valid ones are added in a
single step; the first refused one stays in the box together with whatever came after it, so
nothing you pasted is lost. Each chip has a **Remove tag** button.

Tags also travel with [CSV imports](import-and-qr.md#csv-import) (a `tags` column) and with
the table's CSV export, so an export can be imported again.

### REST API

`tags` is accepted on `POST /api/v1/links` and `PATCH /api/v1/links/{id}` and is
returned on every link object.

- On create, omit it for no tags.
- On update, an array **replaces** all tags, `[]` clears them and omitting the field
  keeps the current tags.
- Invalid tags are rejected with `400 VALIDATION_ERROR`.

Filtering by tag is dashboard-only for now; `GET /api/v1/links` does not take a tag
parameter.

### Implementation map

| Layer      | File                                                                                |
| ---------- | ----------------------------------------------------------------------------------- |
| Schema     | `src/server/db/schema/links.ts`: `tags text[] not null default '{}'` + GIN index    |
| Migration  | `src/server/db/migrations/0001_link_tags.sql`                                       |
| Port       | `ILinkRepository.list({ tag })` and `listTags(userId)`                              |
| Drizzle    | `arrayContains(links.tags, [tag])`; `listTags` is `select distinct unnest(tags)`    |
| In-memory  | `InMemoryLinkRepository` mirrors both for unit tests                                |
| Service    | `LinkService` (`cleanTags`, `list({ tag })`, `listTags(actor, scope)`)              |
| Validation | `src/lib/tags.ts`, `tagSchema` in `src/features/links/schemas.ts`, `api-schemas.ts` |
| UI         | `tags-input.tsx`, `tag-badge.tsx`, `link-form.tsx`, `links-table.tsx`               |
| Tests      | `tests/unit/tags.test.ts`, tag case in `tests/integration/link.repository.test.ts`  |

Existing databases get the column from the `0001_link_tags` migration; current links
start with an empty tag list. Migrations run automatically on container start.

Links can also be filed in [folders](folders.md) (one per link), which the dashboard and the REST API filter by.

## UTM campaign builder

A collapsible **Campaign tracking (UTM)** card in the link form adds
`utm_source`, `utm_medium`, `utm_campaign`, `utm_term` and `utm_content` to the long
URL, so Google Analytics (or any analytics tool on the destination) can attribute
visits to a campaign.

- **Presets:** Instagram bio, TikTok, Email newsletter and Printed flyer fill
  source and medium (they keep any campaign/term/content you already typed).
- **Live preview:** shows the resulting URL as you type.
- **Apply to long URL:** writes the result into the **Long URL** field. The builder
  never owns the URL, so the destination field stays the single source of truth and
  the normal validation, Safe Browsing check and blocklist still apply on save.
- When opened on an existing URL that already has `utm_*` parameters, the fields are
  pre-filled from it. Other query parameters and the `#hash` are preserved; blank
  fields remove their parameter.

The builder is purely client-side: no schema, API or server change. The pure URL
logic is in `src/features/links/utm.ts` (covered by `tests/unit/utm.test.ts`) and the
card is `src/features/links/components/utm-builder.tsx`.

### How this relates to analytics and forwarding

- Vialb records the `utm_*` parameters of **incoming** visits to the short link
  (the `clicks.utm_*` columns) and shows them under UTM campaigns in analytics.
- With `FORWARD_QUERY_PARAMS=true` (default), query parameters on the short link are
  also passed through to the destination.
- The builder is different: it bakes the parameters into the **destination** so
  every visit is tagged, whether or not the visitor's request carried any.
