import { boolean, date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { user } from "./auth";
import { workspaces } from "./workspaces";

/**
 * Single-row table (id = 1). NULL columns mean "use the environment default",
 * so env vars stay the source of defaults and the admin UI only stores
 * explicit overrides.
 */
export const instanceSettings = pgTable("instance_settings", {
  id: integer("id").primaryKey().default(1),
  allowAnonymousLinks: boolean("allow_anonymous_links"),
  allowSignups: boolean("allow_signups"),
  anonLinkTtlHours: integer("anon_link_ttl_hours"),
  blockedDomains: text("blocked_domains").array(),
  pixelsEnabled: boolean("pixels_enabled"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** One random salt per UTC day for visitor hashing; old rows can be pruned. */
export const dailySalts = pgTable("daily_salts", {
  day: date("day", { mode: "string" }).primaryKey(),
  salt: text("salt").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** The workspace the key acts in (with the owner's role there). */
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** First characters of the key, shown in the UI and used for lookup. */
  prefix: text("prefix").notNull().unique(),
  /** sha256 of the full key (keys are 256-bit random, so a fast hash is fine). */
  hash: text("hash").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
