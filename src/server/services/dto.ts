import type { LinkPixels } from "@/lib/pixels";
import type { QrEcc, QrFrame } from "@/lib/qr-options";
import type { RoutingRule } from "@/lib/routing";
import { cardVersion, type CardDesign } from "@/lib/social-card";
import type { ApiKey, HealthReason, HealthState, Link, LinkHealth } from "@/server/domain/types";
import { needsAttention } from "@/server/lib/health-state";

export type LinkStatus = "active" | "expired" | "limit_reached" | "disabled";

/** What the dashboard and API show about the last destination checks. */
export interface LinkHealthDto {
  state: HealthState;
  /** Flagged and not dismissed: the dashboard shows a "needs attention" badge. */
  needsAttention: boolean;
  dismissed: boolean;
  lastCheckedAt: string | null;
  reason: HealthReason | null;
  statusCode: number | null;
  /** Which URL failed: the destination or a routing target. */
  failingTarget: string | null;
}

export function toHealthDto(health: LinkHealth): LinkHealthDto {
  return {
    state: health.state,
    needsAttention: needsAttention(health),
    dismissed: health.state === "flagged" && health.dismissedAt !== null,
    lastCheckedAt: health.lastCheckedAt?.toISOString() ?? null,
    reason: health.lastReason,
    statusCode: health.lastStatusCode,
    failingTarget: health.failingTarget,
  };
}

/** Serializable link shape shared by server actions, pages and the REST API. */
export interface LinkDto {
  id: string;
  code: string;
  shortUrl: string;
  destinationUrl: string;
  title: string | null;
  tags: string[];
  routingRules: RoutingRule[];
  cardDesign: CardDesign | null;
  pixels: LinkPixels | null;
  hasPassword: boolean;
  /** Address of the public, read-only stats page; `null` while the owner keeps it private. */
  statsUrl: string | null;
  /** The redirect adds a `vclid` to the destination so it can report conversions. */
  conversionsEnabled: boolean;
  expiresAt: string | null;
  maxClicks: number | null;
  clickCount: number;
  isEnabled: boolean;
  status: LinkStatus;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  qrFgColor: string;
  qrBgColor: string;
  qrEcc: QrEcc;
  qrFrame: QrFrame;
  qrFrameText: string | null;
  /** `null` when the link was never checked (or the monitor is off). */
  health: LinkHealthDto | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function linkStatus(link: Link, now: Date): LinkStatus {
  if (!link.isEnabled) return "disabled";
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return "expired";
  if (link.maxClicks !== null && link.clickCount >= link.maxClicks) return "limit_reached";
  return "active";
}

export function shortUrlFor(siteUrl: string, code: string): string {
  return `${siteUrl}/${encodeURIComponent(code)}`;
}

/** Public URL of a link's designed social card; `?v=` changes with the design so caches refresh. */
export function cardUrlFor(siteUrl: string, link: Pick<Link, "code" | "cardDesign">): string {
  const version = link.cardDesign ? `?v=${cardVersion(link.cardDesign)}` : "";
  return `${shortUrlFor(siteUrl, link.code)}/card${version}`;
}

export function toLinkDto(link: Link, siteUrl: string, now: Date, health: LinkHealth | null = null): LinkDto {
  return {
    id: link.id,
    code: link.code,
    shortUrl: shortUrlFor(siteUrl, link.code),
    destinationUrl: link.destinationUrl,
    title: link.title,
    tags: link.tags,
    routingRules: link.routingRules,
    cardDesign: link.cardDesign,
    pixels: link.pixels,
    hasPassword: link.passwordHash !== null,
    statsUrl: link.statsToken ? `${siteUrl}/stats/${link.statsToken}` : null,
    conversionsEnabled: link.conversionsEnabled,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    maxClicks: link.maxClicks,
    clickCount: link.clickCount,
    isEnabled: link.isEnabled,
    status: linkStatus(link, now),
    ogTitle: link.ogTitle,
    ogDescription: link.ogDescription,
    ogImageUrl: link.ogImageUrl,
    qrFgColor: link.qrFgColor,
    qrBgColor: link.qrBgColor,
    qrEcc: link.qrEcc,
    qrFrame: link.qrFrame,
    qrFrameText: link.qrFrameText,
    health: health ? toHealthDto(health) : null,
    ownerId: link.userId,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}

export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export function toApiKeyDto(key: ApiKey): ApiKeyDto {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}
