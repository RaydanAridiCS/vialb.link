/**
 * Persistence-agnostic domain types. Repositories return these; services and
 * routes never see Drizzle row types.
 */

import type { SocialLink } from "@/lib/bio";
import type { PaletteKey } from "@/lib/palettes";
import type { CardDesign } from "@/lib/social-card";
import type { RoutingRule } from "@/lib/routing";
import type { QrEcc, QrFrame } from "@/lib/qr-options";

export type Role = "user" | "admin";

export type Actor =
  | { kind: "user"; userId: string; role: Role }
  | { kind: "anonymous"; ip: string | null }
  | { kind: "system" };

/** `bio_button` links are created by a bio page and hidden from the normal links list. */
export type LinkKind = "link" | "bio_button";

export interface Link {
  id: string;
  kind: LinkKind;
  code: string;
  destinationUrl: string;
  userId: string | null;
  title: string | null;
  tags: string[];
  /** Ordered smart-routing rules; the first match replaces `destinationUrl`. */
  routingRules: RoutingRule[];
  /** Designed social preview card; `null` when the link has none. */
  cardDesign: CardDesign | null;
  passwordHash: string | null;
  expiresAt: Date | null;
  maxClicks: number | null;
  clickCount: number;
  isEnabled: boolean;
  deletedAt: Date | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  qrFgColor: string;
  qrBgColor: string;
  qrEcc: QrEcc;
  qrFrame: QrFrame;
  qrFrameText: string | null;
  createdIpHash: string | null;
  claimTokenHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewLink = Pick<Link, "code" | "destinationUrl"> &
  Partial<
    Pick<
      Link,
      | "kind"
      | "userId"
      | "title"
      | "tags"
      | "routingRules"
      | "cardDesign"
      | "passwordHash"
      | "expiresAt"
      | "maxClicks"
      | "clickCount"
      | "isEnabled"
      | "ogTitle"
      | "ogDescription"
      | "ogImageUrl"
      | "qrFgColor"
      | "qrBgColor"
      | "qrEcc"
      | "qrFrame"
      | "qrFrameText"
      | "createdIpHash"
      | "claimTokenHash"
      | "createdAt"
    >
  >;

export type LinkPatch = Partial<
  Pick<
    Link,
    | "destinationUrl"
    | "title"
    | "tags"
    | "routingRules"
    | "cardDesign"
    | "passwordHash"
    | "expiresAt"
    | "maxClicks"
    | "isEnabled"
    | "ogTitle"
    | "ogDescription"
    | "ogImageUrl"
    | "qrFgColor"
    | "qrBgColor"
    | "qrEcc"
    | "qrFrame"
    | "qrFrameText"
    | "userId"
    | "claimTokenHash"
  >
>;

export type LinkStatusFilter = "all" | "active" | "expired" | "disabled" | "protected";
export type LinkSort = "created_desc" | "created_asc" | "clicks_desc" | "clicks_asc";

export interface LinkListQuery {
  /** Restrict to one owner. `undefined` = every link (admin only). */
  userId?: string;
  search?: string;
  /** Only links carrying this (normalized) tag. */
  tag?: string;
  /** Defaults to `link`: bio page buttons are hidden unless `any` is asked for (admin review). */
  kind?: LinkKind | "any";
  status?: LinkStatusFilter;
  sort?: LinkSort;
  page: number;
  pageSize: number;
  now: Date;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export type DeviceType = "desktop" | "mobile" | "tablet" | "bot" | "other";

export interface NewClick {
  linkId: string;
  occurredAt?: Date;
  visitorHash: string;
  country: string | null;
  region: string | null;
  city: string | null;
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  deviceType: DeviceType;
  referrerHost: string | null;
  referrerUrl: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  language: string | null;
  isBot: boolean;
  /** Which smart-routing rule sent the visitor (`default`, `ios`, `country:FR`…). `null` for links without rules. */
  routedBy?: string | null;
}

export interface Click extends NewClick {
  id: number;
  occurredAt: Date;
}

export interface TimeRange {
  from: Date;
  to: Date;
}

export type Bucket = "hour" | "day";

export interface ClickFilter extends TimeRange {
  linkId: string;
  includeBots: boolean;
}

export interface AnalyticsSummary {
  totalClicks: number;
  uniqueVisitors: number;
  botClicks: number;
}

export interface TimeseriesPoint {
  bucket: Date;
  clicks: number;
}

export interface HeatmapCell {
  /** 0 = Sunday … 6 = Saturday (UTC). */
  weekday: number;
  hour: number;
  clicks: number;
}

export interface DimensionCount {
  value: string;
  clicks: number;
}

export type AnalyticsDimension =
  | "country"
  | "city"
  | "device_type"
  | "browser"
  | "os"
  | "referrer_host"
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "language"
  | "routed_by";

export interface UserOverviewStats {
  totalLinks: number;
  clicks7d: number;
  clicks30d: number;
  topLinks: { id: string; code: string; title: string | null; clicks: number }[];
  daily: TimeseriesPoint[];
}

export interface InstanceStats {
  users: number;
  links: number;
  clicks: number;
  clicks24h: number;
}

export interface InstanceSettingsOverride {
  allowAnonymousLinks: boolean | null;
  allowSignups: boolean | null;
  anonLinkTtlHours: number | null;
  blockedDomains: string[] | null;
}

export interface InstanceSettings {
  allowAnonymousLinks: boolean;
  allowSignups: boolean;
  anonLinkTtlHours: number;
  blockedDomains: string[];
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  hash: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string | null;
  banned: boolean | null;
}

export interface BioProfile {
  userId: string;
  /** Lowercase, unique. Served at `/@handle`. */
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  theme: PaletteKey;
  socials: SocialLink[];
  showBadge: boolean;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NewBioProfile = Omit<BioProfile, "createdAt" | "updatedAt">;

export interface BioButton {
  id: string;
  userId: string;
  /** The hidden `links` row this button redirects through, so clicks are counted like any link. */
  linkId: string;
  label: string;
  position: number;
  isVisible: boolean;
  createdAt: Date;
}

/** The repository appends the button after the user's last one. */
export type NewBioButton = Pick<BioButton, "userId" | "linkId" | "label">;
