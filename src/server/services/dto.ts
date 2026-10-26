import type { QrEcc, QrFrame } from "@/lib/qr-options";
import type { ApiKey, Link } from "@/server/domain/types";

export type LinkStatus = "active" | "expired" | "limit_reached" | "disabled";

/** Serializable link shape shared by server actions, pages and the REST API. */
export interface LinkDto {
  id: string;
  code: string;
  shortUrl: string;
  destinationUrl: string;
  title: string | null;
  tags: string[];
  hasPassword: boolean;
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

export function toLinkDto(link: Link, siteUrl: string, now: Date): LinkDto {
  return {
    id: link.id,
    code: link.code,
    shortUrl: shortUrlFor(siteUrl, link.code),
    destinationUrl: link.destinationUrl,
    title: link.title,
    tags: link.tags,
    hasPassword: link.passwordHash !== null,
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
