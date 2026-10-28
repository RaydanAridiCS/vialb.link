import { boolean, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { workspaces } from "./workspaces";

/**
 * Per-person email preferences. Better Auth owns the `user` table, so these live beside it. A missing
 * row means "all on": people are opted in by default and can opt out in their settings.
 */
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  weeklyReport: boolean("weekly_report").notNull().default(true),
  brokenLinksEmail: boolean("broken_links_email").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * One row per scheduled email a person was sent (or is being sent) for a period. The primary key is the
 * idempotency guard: inserting the row first is how a sender "claims" the email, so a restart or a second
 * instance can never send the same one twice.
 */
export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    /** `weekly_report` or `broken_links`. */
    kind: text("kind").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The scheduled send instant the email belongs to, e.g. `2026-06-01T08`. */
    periodKey: text("period_key").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null while the send is in flight; a claim that stays unsent for long can be taken over. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.kind, t.workspaceId, t.userId, t.periodKey] })],
);
