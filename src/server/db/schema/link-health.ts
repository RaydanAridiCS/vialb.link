import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { HealthCheckEntry, HealthReason, HealthState } from "@/server/domain/types";
import { links } from "./links";

/**
 * Latest destination-check state of a link, plus a small bounded history (last entries only, trimmed in
 * code). One row per link; it is deleted when the destination or routing changes, so a new target starts
 * with a clean record.
 */
export const linkHealth = pgTable(
  "link_health",
  {
    linkId: uuid("link_id")
      .primaryKey()
      .references(() => links.id, { onDelete: "cascade" }),
    state: text("state").$type<HealthState>().notNull().default("ok"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull().defaultNow(),
    lastReason: text("last_reason").$type<HealthReason>(),
    lastStatusCode: integer("last_status_code"),
    /** Which URL failed: the destination or one of the smart-routing / split targets. */
    failingTarget: text("failing_target"),
    flaggedAt: timestamp("flagged_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    history: jsonb("history")
      .$type<HealthCheckEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (t) => [
    index("link_health_next_check_idx").on(t.nextCheckAt),
    index("link_health_flagged_idx")
      .on(t.state)
      .where(sql`${t.state} = 'flagged'`),
  ],
);
