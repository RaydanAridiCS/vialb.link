# Importing links from the legacy app

Vialb replaces the URL shortener that used to live inside a larger toolkit
site (Express + React + Prisma/SQLite). Links can be migrated with
[`scripts/import-legacy.ts`](../scripts/import-legacy.ts); old printed
`/s/{code}` links keep working through a permanent redirect to `/{code}`.

## 1. Export from SQLite

The importer expects one row per link with these columns:

```
shortCode, originalUrl, title, clicks, isActive, expiresAt, createdAt,
password (bcrypt hash), accessLimit, accessCount, metaTitle,
metaDescription, metaImageUrl, qrCodeColor, userEmail
```

Use `sqlite3 -json` and alias your columns to those names. Adjust the table and
column names on the right-hand side to match your Prisma schema:

```bash
sqlite3 -json prisma/dev.db "
  SELECT s.shortCode       AS shortCode,
         s.originalUrl     AS originalUrl,
         s.title           AS title,
         s.clicks          AS clicks,
         s.isActive        AS isActive,
         s.expiresAt       AS expiresAt,
         s.createdAt       AS createdAt,
         s.password        AS password,
         s.accessLimit     AS accessLimit,
         s.accessCount     AS accessCount,
         s.metaTitle       AS metaTitle,
         s.metaDescription AS metaDescription,
         s.metaImageUrl    AS metaImageUrl,
         s.qrCodeColor     AS qrCodeColor,
         u.email           AS userEmail
  FROM ShortUrl s LEFT JOIN User u ON u.id = s.userId;
" > legacy-links.json
```

A CSV with the same header row works too.

## 2. Prepare Vialb

- Run Vialb at least once and **sign up** (the first user is the admin).
- Ask existing users to sign up with the same email they used before, so their
  links are assigned to them. Links whose email has no account go to the admin.

## 3. Import

```bash
# preview: validates rows and prints what would happen (code conflicts are only detected in a real run)
npm run import:legacy -- ./legacy-links.json --dry-run
# import
npm run import:legacy -- ./legacy-links.json
```

With Docker, run it from a checkout of the repository with `DATABASE_URL`
pointing at the instance's database.

## What gets mapped how

| Legacy                          | Vialb                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `shortCode`                     | `code` (must match `^[A-Za-z0-9_-]{3,50}$` and not be reserved, otherwise skipped) |
| `originalUrl`                   | `destination_url` (only `http`/`https`; `javascript:` etc. are skipped)            |
| `isActive`                      | `is_enabled`                                                                       |
| `accessLimit` / `accessCount`   | `max_clicks` / `click_count` (`clicks` is used if larger)                          |
| `password` (bcrypt)             | kept as-is, upgraded to argon2id on first successful unlock                        |
| `metaTitle` / `metaDescription` | `og_title` / `og_description` (truncated to 70 / 200 chars)                        |
| `metaImageUrl`                  | `og_image_url` only if it's an `https://` URL; base64 images are dropped           |
| `qrCodeColor`                   | `qr_fg_color` when it's a `#RRGGBB` value                                          |
| `userEmail`                     | owner (matched case-insensitively), else the first admin                           |

Existing codes are never overwritten. Click history isn't imported, because the
old app stored raw IP addresses, which Vialb deliberately doesn't keep.
