import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per scheduled job. `next_run_at` and `lease_until` are compare-and-set targets: a replica
 * runs a job only if its single UPDATE wins, so restarts and several instances never double-run it.
 */
export const jobRuns = pgTable("job_runs", {
  name: text("name").primaryKey(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
  /** While in the future, some instance is running the job (or died while doing so). */
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
  lastFinishedAt: timestamp("last_finished_at", { withTimezone: true }),
  lastStatus: text("last_status"),
  lastError: text("last_error"),
  /** Free-form one-line outcome shown in the admin UI, e.g. "checked 12 links". */
  lastSummary: text("last_summary"),
});
