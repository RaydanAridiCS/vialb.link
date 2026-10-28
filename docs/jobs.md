# Background jobs

Vialb runs a small scheduler inside the server process. There is no worker container and no queue.

| Job                   | Runs             | Does                                                                   | Switched by                                         |
| --------------------- | ---------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| `link-health`         | every 5 minutes  | Checks the links that are due ([link health](link-health.md))          | `HEALTH_MONITOR_ENABLED` / admin setting            |
| `weekly-report`       | every 15 minutes | Sends the weekly report inside its send window ([reports](reports.md)) | `WEEKLY_REPORT_ENABLED` / admin setting, needs SMTP |
| `broken-links-digest` | every 15 minutes | Sends the weekly list of broken links                                  | the two settings above                              |

Each job checks its own switch on every pass, so changing a setting in the admin UI takes effect
without a restart.

## How it stays safe with restarts and replicas

`register()` in `src/instrumentation.ts` starts one timer per server process (not awaited, so the server
is not held back; skipped while `next build` runs). A job runs only on the instance that wins a
compare-and-set on its row in `job_runs`:

```sql
UPDATE job_runs SET lease_until = …, last_started_at = …
WHERE name = $1 AND next_run_at <= now AND (lease_until IS NULL OR lease_until <= now)
RETURNING name
```

- Two replicas ticking at the same moment: exactly one `UPDATE` returns a row.
- A process that dies mid-run leaves a lease; after 15 minutes another instance takes over.
- The next run is measured from the **end** of a run (`next_run_at = finished + interval`).
- Emails add a second guard, the `email_deliveries` ledger, so even a broken lease cannot send twice.

Set `JOBS_ENABLED=false` on replicas that should never run jobs. The scheduler is in-process on purpose;
there is no external cron endpoint.

## Not included

A job queue, retries with back-off beyond the next scheduled pass, per-workspace time zones.
