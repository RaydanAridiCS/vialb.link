import { sql } from "drizzle-orm";
import {
  bigint,
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
import type { QrEcc, QrFrame } from "@/lib/qr-options";
import type { LinkPixels } from "@/lib/pixels";
import type { RoutingRule } from "@/lib/routing";
import type { CardDesign } from "@/lib/social-card";
import type { LinkKind } from "@/server/domain/types";
import { v7 as uuidv7 } from "uuid";
import { user } from "./auth";
import { folders } from "./folders";
import { workspaces } from "./workspaces";

export const links = pgTable(
  "links",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    /** Case-sensitive. Soft-deleted rows keep their code reserved. */
    code: text("code").notNull(),
    /** `bio_button` rows belong to a bio page and are hidden from the links list. */
    kind: text("kind").$type<LinkKind>().notNull().default("link"),
    destinationUrl: text("destination_url").notNull(),
    /** Who created it. Kept (set null) when that person leaves: the link belongs to its workspace. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Who may see and change the link. `null` only for anonymous links nobody has claimed. */
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title"),
    /** The folder the link is filed in; `null` = none. Deleting the folder clears it. */
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    /** Normalized (lowercase) labels used to group and filter links in the dashboard. */
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Smart routing: ordered rules, first match wins. Empty means "always `destination_url`". */
    routingRules: jsonb("routing_rules")
      .$type<RoutingRule[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Designed social preview card (template, palette, text); `null` when there is none. */
    cardDesign: jsonb("card_design").$type<CardDesign>(),
    /** Retargeting tag IDs fired from the consent page; `null` when the link has none. */
    pixels: jsonb("pixels").$type<LinkPixels>(),
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
    /** Error correction level. Rows from before QR options existed keep "M", what they were drawn with. */
    qrEcc: text("qr_ecc").$type<QrEcc>().notNull().default("M"),
    qrFrame: text("qr_frame").$type<QrFrame>().notNull().default("none"),
    /** Text on the badge frame; `null` means the default "Scan me". */
    qrFrameText: text("qr_frame_text"),
    createdIpHash: text("created_ip_hash"),
    /** sha256 of the one-time claim token handed to anonymous creators. */
    claimTokenHash: text("claim_token_hash"),
    /** Unguessable token of the opt-in public stats page (`/stats/<token>`); `null` = no public page. */
    statsToken: text("stats_token"),
    /** Opt-in conversion tracking: the redirect adds a random `vclid` to the destination and stores it on the click. */
    conversionsEnabled: boolean("conversions_enabled").notNull().default(false),
    /** Show a "you are about to leave" page with the destination instead of redirecting at once. */
    previewInterstitial: boolean("preview_interstitial").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("links_code_unique").on(t.code),
    index("links_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("links_workspace_created_idx").on(t.workspaceId, t.createdAt.desc()),
    index("links_expires_at_idx").on(t.expiresAt),
    index("links_folder_idx").on(t.folderId),
    index("links_tags_idx").using("gin", t.tags),
    uniqueIndex("links_stats_token_unique")
      .on(t.statsToken)
      .where(sql`${t.statsToken} is not null`),
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
    /** Which routing rule sent the visitor; `null` when the link has no rules. */
    routedBy: text("routed_by"),
    /**
     * Random per-click id (96 bits, derived from nothing) handed to the destination as `vclid` so it can report a
     * conversion. A bearer secret: never exported or shown. `null` when the link does not track conversions.
     */
    clickRef: text("click_ref"),
  },
  (t) => [
    index("clicks_link_occurred_idx").on(t.linkId, t.occurredAt),
    index("clicks_link_country_idx").on(t.linkId, t.country),
    index("clicks_link_is_bot_idx").on(t.linkId, t.isBot),
    // Clicks arrive in time order, so a BRIN index is tiny and makes "older than the cutoff" scans cheap.
    uniqueIndex("clicks_click_ref_unique")
      .on(t.clickRef)
      .where(sql`${t.clickRef} is not null`),
    index("clicks_occurred_brin").using("brin", t.occurredAt),
  ],
);
