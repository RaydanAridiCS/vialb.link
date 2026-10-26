# CSV import and QR codes

Two dashboard features that help people move to Vialb and put their links on paper:
**CSV bulk import** and the **QR customizer**.

## CSV import

**Links → Import CSV** opens a side sheet that walks through _choose a file → review →
import → summary_. Someone leaving Bitly, TinyURL or a spreadsheet can bring hundreds of
links over in one go. Importing needs an account (anonymous users cannot import).

### File format

A plain CSV with one link per row.

| Field           | Header names we recognise (case-insensitive)                                        | Notes                                                                   |
| --------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Destination URL | `url`, `destination`, `destination_url`, `long_url`, `link`, `target`, `target_url` | **Required.** `http://` or `https://` only, at most 2048 chars.         |
| Title           | `title`, `name`, `label`                                                            | Optional, at most 100 characters.                                       |
| Custom code     | `custom_code`, `code`, `short_code`, `slug`, `back_half`, `keyword`, `alias`        | Optional. Empty = a random code. 3-50 chars: letters, digits, `-`, `_`. |
| Tags            | `tags`, `tag`, `labels`, `categories`, `category`                                   | Optional. Separate with commas, semicolons, `\|` or spaces.             |

Headers are matched after lowercasing and turning spaces, dashes and dots into `_`, so
`Long URL`, `long-url` and `long_url` are the same. Unknown columns (Bitly's `created_at`,
click counts, ...) are ignored. You can always change the detected columns in the review
step, and untick **First row contains column names** for files without a header.

What the reader copes with:

- UTF-8 (with or without BOM) and Windows-1252 (Excel on Windows)
- Comma, semicolon (European Excel) and tab delimiters, detected from the first row
- `\n`, `\r\n` and `\r` line endings, blank lines and rows of only empty cells
- Quoted cells with commas, newlines and `""` escaped quotes
- A leading `'` in front of `=`, `+`, `-` or `@`: that is the formula-injection guard our own
  CSV exports add, and it is removed again so an export can be re-imported unchanged

Row numbers in messages are spreadsheet rows (the header is row 1, blank rows count), so
"row 17" is row 17 when you open the file in Excel.

Sample file (also available from the sheet's **Download a sample file**):

```csv
url,title,custom_code,tags
https://example.com/spring-menu,Spring menu,spring-menu,promo menus
https://example.com/newsletter/42,Newsletter #42,,newsletter
```

### Limits

| Limit                | Value                            | Constant                    |
| -------------------- | -------------------------------- | --------------------------- |
| File size            | 2 MB                             | `LIMITS.importMaxBytes`     |
| Data rows per file   | 1,000                            | `LIMITS.importMaxRows`      |
| Rows per server call | 50                               | `LIMITS.importBatchSize`    |
| Import budget        | 100 batches per hour per user    | `RATE_LIMITS.importBatches` |
| Preview rows shown   | 100 (every row is still checked) | `LIMITS.importPreviewRows`  |

### The flow

1. **Choose a file** by dragging it onto the sheet or with the file picker.
2. **Review.** Columns are detected and can be changed. Every row gets a status _before_
   anything is created: invalid or non-http(s) URL, over-long title, invalid, reserved or
   duplicate custom code (inside the file, and against the database), invalid tags, too many
   tags. Codes that already point at the same destination for you are marked **Already
   imported** and will be skipped. Rows with problems are not imported; **Only rows with
   problems** narrows the table down.
3. **Import.** The browser sends the ready rows in batches of 50, with a progress bar
   (`aria-live="polite"` status text) and a **Cancel import** button. The UI never blocks.
4. **Summary:** created / skipped / failed counts, the list of failed rows with their
   original row number and reason, and **Download failed rows (CSV)**.

Imported links behave exactly like links made in the form: same URL normalization, same
destination checks (blocklist, own-host, Safe Browsing), same tag rules, same default QR
design, and the importing user owns them.

### Error semantics

- **Every row stands alone.** A bad row never rolls back the others; the database's unique
  constraint on the code stays the source of truth, so two people importing the same code at
  once cannot both win.
- **Re-importing is safe.** A row whose custom code already belongs to _you_ with the _same_
  destination is reported as `skipped` ("Already imported"). The same code with a different
  destination, or a code owned by someone else (or by a deleted link, whose code stays
  reserved), is a failure.
- **The error CSV** uses the importer's own column names plus `error` and `original_row`:
  `url,title,custom_code,tags,error,original_row`. Fix the rows, upload the file again, and
  only the fixed ones are created. All cells go through the formula-injection guard.
- If a batch is refused (for example you hit the rate limit) or the connection drops, the
  import stops, and the rows that were not sent are listed as failed with the reason, so
  nothing is lost silently.
- Unexpected server errors are reported as "Could not create this link" without internals.

### Rate limits and cost

`LinkService.create` allows 60 links per hour per user, which would make a 500-row import
impossible. Imports therefore have their **own budget** instead of bypassing limits: one
`importBatches` token per request of up to 50 rows, 100 per hour per user (about five full
1,000-row files). Admins are exempt, like for normal links. The per-link create limit is a
separate budget and is not touched by imports.

`AbuseService.assertDestinationAllowed` may call Google Safe Browsing for each URL. Within
one batch every distinct URL is checked **once** (verdicts are cached per request) and rows
are processed one after another, so at most 50 lookups per request and no burst of parallel
calls. Safe Browsing still **fails open** on a timeout, as it does for single links. If you
need to throttle further, lower `LIMITS.importBatchSize` or `RATE_LIMITS.importBatches`.

### Security notes

File contents are untrusted. The browser parses and validates for the preview, but the server
re-validates every row (`LinkService.importLinks`), so a modified client gains nothing.
Request sizes are bounded (50 rows of at most a few KB each, far below the 1 MB Server
Action limit, so no `next.config.ts` change is needed). Destination URLs are never logged,
the error CSV and the table export share one escaping helper (`src/lib/csv.ts`), and the
download file name is sanitized (`errorCsvFilename`).

### Not included (yet)

A REST endpoint (`POST /api/v1/links/import` or a batch create) is deliberately not part of
this release; it is tracked in [`ROADMAP.md`](../ROADMAP.md). Scripted migrations can create links
one by one with `POST /api/v1/links`.

### Implementation map

| Layer      | File                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| Parser     | `src/features/links/import/csv-parser.ts` (RFC 4180, delimiter sniffing, encodings)                                        |
| Mapping    | `src/features/links/import/column-mapping.ts` (aliases, header detection, tag cells)                                       |
| Row checks | `src/features/links/import/row-validation.ts` (reuses the form's URL, code and tag schemas)                                |
| Error CSV  | `src/features/links/import/error-csv.ts`, `src/lib/csv.ts` (shared escaping)                                               |
| Port       | `ILinkRepository.findCodeHolders(codes)` (soft-deleted links included)                                                     |
| Service    | `LinkService.importLinks`, `LinkService.checkImportCodes`; shares `buildLink` with `create`                                |
| Actions    | `importLinksAction`, `checkImportCodesAction` in `src/features/links/actions.ts`                                           |
| UI         | `import-links-sheet.tsx`, `import-flow.tsx`, `import-review.tsx`, `import-summary.tsx`                                     |
| Tests      | `tests/unit/csv-import.test.ts`, `link-import.test.ts`, `tests/component/import-flow.test.tsx`, `tests/e2e/import.spec.ts` |

## QR codes

Every link has a QR code, drawn on demand and never stored. The **QR code** dialog in the
links table (and the QR card in the link form) lets you design it and download it.

### Options

| Option            | Values                                 | Default for new links | Stored as                        |
| ----------------- | -------------------------------------- | --------------------- | -------------------------------- |
| Foreground colour | `#RRGGBB`                              | `#000000`             | `qr_fg_color`                    |
| Background colour | `#RRGGBB`                              | `#FFFFFF`             | `qr_bg_color`                    |
| Error correction  | `L` 7%, `M` 15%, `Q` 25%, `H` 30%      | **`H`**               | `qr_ecc`                         |
| Frame             | `none`, `badge` (label under the code) | `none`                | `qr_frame`                       |
| Badge text        | up to 24 characters                    | "Scan me"             | `qr_frame_text` (null = default) |

**Why `H` for new links:** a higher level keeps the code readable when it is printed on
rough paper, scuffed or partly covered, and it leaves room for a centre logo later. The cost is
a denser code (a typical short link such as `https://vialb.link/AbC1234` goes from 25x25
modules at `M` to 33x33 at `H`), which is still easy to scan at normal print sizes. Links created before this feature keep `M`: the migration's column default is `M`
and no existing link changes appearance.

### Scannability guard

Colours are checked with the WCAG contrast ratio:

| Condition                                    | What happens                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| Ratio below 2 (practically unreadable)       | **Blocked** when saving (form, dialog, API) and downloads are disabled |
| Ratio below 3                                | Warning: some phones may struggle                                      |
| Light code on a dark background ("inverted") | Warning: many scanners cannot read inverted codes                      |

Already-saved links are never broken by this: rendering never blocks, and an old link with
weak colours stays editable as long as its colours are not changed.

### Downloads

The dialog offers **SVG**, **PNG** (1024 px) and **High-res PNG** (2048 px). File names stay
`qr-<id>.svg` / `qr-<id>.png` (`qr-<id>-hires.png` for the large one). The preview is drawn by
the very same function that produces the SVG download (`composeQrSvg`), so what you see is
what you get. PNG sizes are clamped to 128-2048.

### How it is drawn

- `src/lib/qr-svg.ts` builds the SVG from the QR matrix (`qrcode`'s `create`): one path of
  module runs, an optional rounded badge in the foreground colour with the text in the
  background colour, the text XML-escaped and shrunk to fit. It is pure and runs in the browser
  and on the server.
- SVG downloads are that string. PNG downloads without a frame use `qrcode`'s own PNG writer,
  as before. PNG downloads **with a frame** are that same SVG rasterised by **sharp**
  (a direct dependency, loaded only when a framed PNG is requested).
- The badge text is rendered with a system font. The Docker image installs `fontconfig` and
  `ttf-dejavu` for this; on a bare Linux host without any fonts a framed PNG would show the
  badge without text (the SVG is unaffected).

### Routes and API

| Route                                                  | Parameters (all optional)                                               | Design used                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------- | -------------------------------------- |
| `GET /api/app/links/{id}/qr` (session)                 | `format`, `fg`, `bg`, `size`, `ecc`, `frame`, `frameText`, `download=1` | saved design, overridden by parameters |
| `GET /api/v1/links/{id}/qr.png` / `.svg` (API key)     | `fg`, `bg`, `size` (png), `ecc`, `frame`, `frameText`                   | saved design, overridden by parameters |
| `GET /{code}/qr` (only with `PUBLIC_QR_ENDPOINT=true`) | `format`                                                                | saved design                           |

The link object (`GET /api/v1/links...`) now includes `qrEcc`, `qrFrame` and `qrFrameText`;
`POST` and `PATCH` accept them (`qrFrameText: null` on `PATCH` resets to the default text).
Invalid values are `400 VALIDATION_ERROR`. The OpenAPI document and
[`docs/api.md`](api.md) are updated.

### Not included

A **centre logo upload** is not part of this release. It needs untrusted-upload handling
(type and size limits, SVG sanitising, storage) that deserves its own change; error
correction `H` is already the default so codes are ready for it.

### Implementation map

| Layer      | File                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| Migration  | `src/server/db/migrations/0002_qr_options.sql` (`qr_ecc`, `qr_frame`, `qr_frame_text`)                                   |
| Options    | `src/lib/qr-options.ts` (types, normalization, WCAG contrast, warnings)                                                  |
| Composer   | `src/lib/qr-svg.ts` (`composeQrSvg`, shared by server and browser)                                                       |
| Service    | `src/server/services/qr.service.ts` (SVG, PNG, sharp for framed PNG); `LinkService.cleanQr`                              |
| Routes     | `src/app/api/app/links/[id]/qr`, `src/app/api/v1/links/[id]/[file]`, `src/app/[code]/qr`, `src/server/http/qr-query.ts`  |
| Validation | `qrOptionsSchema`, `qrEccSchema`, ... in `src/features/links/schemas.ts`, `api-schemas.ts`                               |
| UI         | `qr-controls.tsx` (shared), `qr-dialog.tsx`, `qr-preview.tsx`, `link-form.tsx`                                           |
| Tests      | `tests/unit/qr.test.ts`, `tests/component/qr-dialog.test.tsx`, `tests/e2e/qr.spec.ts`, migrations in `tests/integration` |
