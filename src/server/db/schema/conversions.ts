import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clicks, links } from "./links";

/**
 * A conversion reported for one click. Holds no personal data: only which click it belongs to, when, and an
 * optional amount. Everything else (country, device, routing variant) comes from the click row. At most one
 * per click, and it goes away with its click (retention) or link.
 */
export const conversions = pgTable(
  "conversions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    linkId: uuid("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    clickId: bigint("click_id", { mode: "number" })
      .notNull()
      .unique()
      .references(() => clicks.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** Amount in minor units (cents); `null` when the conversion carried no value. */
    valueMinor: bigint("value_minor", { mode: "number" }),
    /** ISO 4217, upper case; set exactly when `valueMinor` is. */
    currency: text("currency"),
  },
  (t) => [index("conversions_link_occurred_idx").on(t.linkId, t.occurredAt)],
);
