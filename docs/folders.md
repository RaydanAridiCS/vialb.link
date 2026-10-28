# Folders and moving links

Tags describe a link (a link can have several). **Folders** file it: a link is in at most one folder, and folders
are flat (no nesting). Both are per workspace.

## Using folders

- **Links page → Folders** creates, renames and deletes folders. Names are up to 40 characters, whitespace is
  collapsed, and they are unique per workspace ignoring case. A workspace can have up to 100.
- The link form has a **Folder** field; the links table shows the folder on each row, filters by folder (or
  "No folder") and has a bulk **Move to folder** (or out of every folder) for selected links.
- **Deleting a folder never deletes its links**: they stay and end up in no folder.
- Who may do what follows [workspace roles](teams.md): everyone in a workspace sees its folders; creating,
  renaming, deleting and filing links needs the editor role or higher. A link can only be filed in a folder of
  its own workspace.

## CSV import

A `folder` column (also `folder_name`, `group`, `collection`) is detected on upload and shown in the preview.
The folder is looked up by name (ignoring case) and **created when it does not exist**, within the 100-folder
limit; a row whose name is unusable fails alone. The error CSV keeps the column so it can be corrected and
uploaded again. The same field exists in the REST import (below).

## REST API

| Method             | Path                         | Notes                                                              |
| ------------------ | ---------------------------- | ------------------------------------------------------------------ |
| `GET` / `POST`     | `/api/v1/folders`            | List (with `linkCount`) / create. Create needs editor or above     |
| `PATCH` / `DELETE` | `/api/v1/folders/{id}`       | Rename / delete (links are kept)                                   |
| `GET`              | `/api/v1/links?tag=&folder=` | `folder` is a folder id or `none`; combines with `tag` and cursors |
| `POST`             | `/api/v1/links/import`       | Up to 100 rows, see below                                          |

Links accept `folderId` on create and update (`null` unfiles) and return `folder: { id, name }`.

### Bulk import

`POST /api/v1/links/import` with `{ "links": [{ "url", "code"?, "title"?, "tags"?, "folder"? }] }`: at most 100
rows and 256 KB. Every row succeeds or fails on its own and gets a result in order:

```json
{
  "results": [
    { "index": 0, "status": "created", "code": "abc", "shortUrl": "https://…/abc" },
    {
      "index": 1,
      "status": "skipped",
      "code": "xyz",
      "shortUrl": "https://…/xyz",
      "reason": "Already imported"
    },
    { "index": 2, "status": "failed", "reason": "This domain is not allowed", "field": "url" }
  ],
  "summary": { "created": 1, "skipped": 1, "failed": 1 }
}
```

A row whose custom `code` already points at the same destination in your workspace is `skipped`, so repeating a
whole request is safe; rows without a code are always new links. Each chunk of 50 rows spends one token of the
import rate limit (100 per hour, instance admins exempt), on top of the normal per-key limit.

## Moving links to another workspace

Select links → **Move to workspace…** (listed: your other workspaces where you are owner or admin). You must be an
**owner or admin of both** workspaces (instance admins excepted); editors and viewers cannot, and nobody can
move links into a workspace they are not in. Up to 100 at a time, from one workspace at a time; bio-page buttons
cannot be moved.

What happens: the links keep their codes, clicks, tags, health record and public stats address, and they leave
their folder (folders belong to a workspace, so the old folder stays where it was). API keys made in the old
workspace stop seeing them; keys of the new workspace see them. The short link keeps working throughout. There is
no audit log.
