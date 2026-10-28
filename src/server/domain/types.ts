/**
 * Persistence-agnostic domain types. Repositories return these; services and
 * routes never see Drizzle row types.
 */

import type { SocialLink } from "@/lib/bio";
import type { InstanceBranding } from "@/lib/branding";
import type { PaletteKey } from "@/lib/palettes";
import type { WorkspaceRole } from "@/lib/permissions";
import type { LinkPixels } from "@/lib/pixels";
import type { CardDesign } from "@/lib/social-card";
import type { RoutingRule } from "@/lib/routing";
import type { QrEcc, QrFrame } from "@/lib/qr-options";

export type Role = "user" | "admin";

/** The workspace a signed-in user is acting in, and what they may do there. Re-checked on every request. */
export interface WorkspaceAccess {
  id: string;
  role: WorkspaceRole;
}

export type Actor =
  | { kind: "user"; userId: string; role: Role; workspace: WorkspaceAccess }
  | { kind: "anonymous"; ip: string | null }
  | { kind: "system" };

/** `bio_button` links are created by a bio page and hidden from the normal links list. */
export type LinkKind = "link" | "bio_button";

export interface Link {
  id: string;
  kind: LinkKind;
  code: string;
  destinationUrl: string;
  /** Who created it. `null` for anonymous links, and when that person has since left. */
  userId: string | null;
  /** The workspace the link belongs to; `null` only for anonymous links nobody has claimed. */
  workspaceId: string | null;
  title: string | null;
  /** The folder it is filed in, if any. */
  folderId: string | null;
  tags: string[];
  /** Ordered smart-routing rules; the first match replaces `destinationUrl`. */
  routingRules: RoutingRule[];
  /** Designed social preview card; `null` when the link has none. */
  cardDesign: CardDesign | null;
  /** Retargeting pixel IDs; `null` when the link has none. Only used while the instance allows pixels. */
  pixels: LinkPixels | null;
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
  /** Token in the URL of the public, read-only stats page; `null` when the owner has not turned it on. */
  statsToken: string | null;
  /** The redirect adds a `vclid` to the destination so conversions can be reported. */
  conversionsEnabled: boolean;
  /** Visitors see the destination and a Continue button before being sent there. */
  previewInterstitial: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NewLink = Pick<Link, "code" | "destinationUrl"> &
  Partial<
    Pick<
      Link,
      | "kind"
      | "userId"
      | "workspaceId"
      | "title"
      | "folderId"
      | "tags"
      | "routingRules"
      | "cardDesign"
      | "pixels"
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
      | "statsToken"
      | "conversionsEnabled"
      | "previewInterstitial"
      | "createdAt"
    >
  >;

export type LinkPatch = Partial<
  Pick<
    Link,
    | "destinationUrl"
    | "title"
    | "folderId"
    | "tags"
    | "routingRules"
    | "cardDesign"
    | "pixels"
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
    | "workspaceId"
    | "claimTokenHash"
    | "statsToken"
    | "conversionsEnabled"
    | "previewInterstitial"
  >
>;

/** `failing` = recent failures below the threshold; `flagged` = shown to the owner as "needs attention". */
export type HealthState = "ok" | "failing" | "flagged";

export type HealthReason =
  | "not_found"
  | "server_error"
  | "timeout"
  | "redirect_loop"
  | "too_many_redirects"
  | "dns"
  | "tls"
  | "blocked_target"
  | "network"
  | "unsafe";

export interface HealthCheckEntry {
  /** ISO timestamp. */
  at: string;
  ok: boolean;
  reason: HealthReason | null;
  status: number | null;
}

export interface LinkHealth {
  linkId: string;
  state: HealthState;
  consecutiveFailures: number;
  lastCheckedAt: Date | null;
  nextCheckAt: Date;
  lastReason: HealthReason | null;
  lastStatusCode: number | null;
  failingTarget: string | null;
  flaggedAt: Date | null;
  dismissedAt: Date | null;
  history: HealthCheckEntry[];
}

export interface Folder {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: Date;
}

export interface FolderWithCount extends Folder {
  linkCount: number;
}

export type LinkStatusFilter = "all" | "active" | "expired" | "disabled" | "protected";
export type LinkSort = "created_desc" | "created_asc" | "clicks_desc" | "clicks_asc";

export interface LinkListQuery {
  /** Restrict to one workspace. `undefined` = every link (admin only). */
  workspaceId?: string;
  search?: string;
  /** Only links carrying this (normalized) tag. */
  tag?: string;
  /** A folder id, or `none` for links that are in no folder. */
  folder?: string;
  /** `attention` = flagged by the health monitor and not dismissed. */
  health?: "attention";
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
  /** The `vclid` handed to the destination; present only for links that track conversions. */
  clickRef?: string | null;
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

/** One workspace's week for the report email: all clicks exclude bots and bio-page buttons. */
export interface WorkspaceReport {
  clicks: number;
  previousClicks: number;
  /** Visitors counted once per UTC day (see docs/analytics.md), so the same person on two days counts twice. */
  uniqueVisitors: number;
  topLinks: { linkId: string; code: string; title: string | null; clicks: number; previousClicks: number }[];
  topReferrers: DimensionCount[];
  topCountries: DimensionCount[];
}

export interface UserPreferences {
  userId: string;
  weeklyReport: boolean;
  brokenLinksEmail: boolean;
}

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
  pixelsEnabled: boolean | null;
  healthMonitorEnabled: boolean | null;
  weeklyReportEnabled: boolean | null;
  reportSendDay: number | null;
  reportSendHourUtc: number | null;
  clickRetentionDays: number | null;
  requireAdmin2fa: boolean | null;
  branding: InstanceBranding | null;
}

export interface InstanceSettings {
  allowAnonymousLinks: boolean;
  allowSignups: boolean;
  anonLinkTtlHours: number;
  blockedDomains: string[];
  /** Whether links may send visitors through the retargeting-pixel consent page. */
  pixelsEnabled: boolean;
  /** Whether the background job checks link destinations and flags broken ones. */
  healthMonitorEnabled: boolean;
  /** Whether the weekly report (and broken-links digest) emails are sent. */
  weeklyReportEnabled: boolean;
  /** Day of the week the report is sent, 0 = Sunday … 6 = Saturday (UTC). */
  reportSendDay: number;
  /** Hour of that day (UTC, 0-23). */
  reportSendHourUtc: number;
  /** How many days individual clicks are kept; 0 keeps them forever. */
  clickRetentionDays: number;
  /** Administrators need two-factor authentication to use the admin area. */
  requireAdmin2fa: boolean;
  /** How the 404 and "gone" pages look; empty = default. */
  branding: InstanceBranding;
}

export interface ApiKey {
  id: string;
  userId: string;
  /** The workspace this key acts in. */
  workspaceId: string;
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

export interface Workspace {
  id: string;
  name: string;
  /** A person's own space: always exactly one member, cannot be renamed, shared or deleted. */
  isPersonal: boolean;
  createdAt: Date;
}

/** A workspace as one person sees it. */
export interface WorkspaceMembership extends Workspace {
  role: WorkspaceRole;
  memberCount: number;
}

export interface WorkspaceMember {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: Date;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: string | null;
  expiresAt: Date;
  createdAt: Date;
}
