# Data retention

By default Vialb keeps every click forever. Two things shrink that.

## Daily salts (always)

Visitor identifiers use a random salt per UTC day. Only today's salt is ever needed, so a daily job deletes
salts older than two days. This is part of the privacy design: once a salt is gone, an old `visitor_hash`
can no longer be recomputed from an address and browser.

## Click retention (opt-in)

Set **Keep click data for (days)** in the admin page, or `CLICK_RETENTION_DAYS` (default `0` = forever, so
upgrading never deletes anything). While you type, the page shows how many stored clicks are older than that
and would go. The `retention` job (daily; "Run now" in the admin page) then deletes clicks older than the
period in batches of 10,000, oldest first, up to 1,000,000 per run. Conversions and click ids go with their
clicks. A link's own visit counter and its access limit are unaffected.

## Do we need rollups?

The question was whether very large instances need pre-aggregated daily tables. `npm run bench:retention`
builds a scratch database, inserts synthetic clicks, times the queries the app runs, applies the retention
delete and times them again. On a development machine with **3,000,000 clicks over 400 days across 200
links** (delete everything older than 90 days):

| Query (median of 3)              | Before (ms) | After (ms) |
| -------------------------------- | ----------: | ---------: |
| one link: summary, 30 days       |         2.0 |        2.6 |
| one link: daily series, 30 days  |         1.6 |        2.4 |
| one link: top countries, 30 days |         1.4 |        1.3 |
| workspace report, 7 days         |       245.1 |      178.9 |
| active workspaces, 7 days        |        97.1 |       59.7 |
| count clicks older than 90 days  |        68.1 |       82.9 |

Rows 3,000,000 → 674,379 (2,325,621 deleted in 73.5 s in 10,000-row batches); table 370 MB; the BRIN index on
`occurred_at` is 32 kB and the cutoff scan uses it (`Bitmap Index Scan on clicks_occurred_brin`).

Reading it: per-link analytics stay in single-digit milliseconds because they use the
`(link_id, occurred_at)` index and do not care about total table size. The only whole-workspace queries are
the weekly report and the dashboard overview, and they stay far below a second at this size and improve after
pruning. **No rollup table was added**; revisit if workspace-level queries pass about a second on your data.
(Single machine, synthetic uniform data: treat as an order of magnitude, not a promise.)
