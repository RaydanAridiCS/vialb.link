import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";
import { user } from "./auth";

export const links = pgTable(
  "links",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** Case-sensitive. Soft-deleted rows keep their code reserved. */
    code: text("code").notNull(),
    destinationUrl: text("destination_url").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxClicks: integer("max_clicks"),
    clickCount: integer("click_count").notNull().default(0),
    isEnabled: boolean("is_enabled").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ogTitle: text("og_title"),
    ogDescription: text("og_description"),
    ogImageUrl: text("og_image_url"),
    qrFgColor: text("qr_fg_color").notNull().default("#000000"),
    qrBgColor: text("qr_bg_color").notNull().default("#FFFFFF"),
    createdIpHash: text("created_ip_hash"),
    /** sha256 of the one-time claim token handed to anonymous creators. */
    claimTokenHash: text("claim_token_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("links_code_unique").on(t.code),
    index("links_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("links_expires_at_idx").on(t.expiresAt),
    index("links_claim_token_idx")
      .on(t.claimTokenHash)
      .where(sql`${t.claimTokenHash} is not null`),
  ],
);

export const clicks = pgTable(
  "clicks",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    linkId: uuid("link_id")
      .notNull()
      .references(() => links.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** sha256(ip + userAgent + dailySalt). Raw IPs are never stored. */
    visitorHash: text("visitor_hash").notNull(),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    browser: text("browser"),
    browserVersion: text("browser_version"),
    os: text("os"),
    osVersion: text("os_version"),
    deviceType: text("device_type").notNull().default("other"),
    referrerHost: text("referrer_host"),
    referrerUrl: text("referrer_url"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    language: text("language"),
    isBot: boolean("is_bot").notNull().default(false),
  },
  (t) => [
    index("clicks_link_occurred_idx").on(t.linkId, t.occurredAt),
    index("clicks_link_country_idx").on(t.linkId, t.country),
    index("clicks_link_is_bot_idx").on(t.linkId, t.isBot),
  ],
);
