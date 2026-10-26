import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import type { SocialLink } from "@/lib/bio";
import type { PaletteKey } from "@/lib/palettes";
import { user } from "./auth";
import { links } from "./links";

/** One link-in-bio page per user, served at `/@handle`. */
export const bioProfiles = pgTable(
  "bio_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Lowercase; uniqueness is case-insensitive because it is always stored lowercase. */
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    theme: text("theme").$type<PaletteKey>().notNull().default("paper"),
    socials: jsonb("socials")
      .$type<SocialLink[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    showBadge: boolean("show_badge").notNull().default(true),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("bio_profiles_handle_unique").on(t.handle)],
);

/** An ordered button on a bio page. Each one owns a hidden `links` row (kind `bio_button`). */
export const bioButtons = pgTable(
  "bio_buttons",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    linkId: uuid("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    isVisible: boolean("is_visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bio_buttons_link_unique").on(t.linkId),
    index("bio_buttons_user_position_idx").on(t.userId, t.position),
  ],
);
