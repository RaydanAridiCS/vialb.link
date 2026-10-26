import { isbot } from "isbot";
import { UAParser } from "ua-parser-js";
import { PREVIEW_BOT_PATTERNS } from "@/lib/constants";
import type { RoutingPlatform } from "@/lib/routing";
import type { DeviceType } from "@/server/domain/types";

export interface ParsedUserAgent {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  deviceType: DeviceType;
  isBot: boolean;
}

const previewBotRegex = new RegExp(PREVIEW_BOT_PATTERNS.join("|"), "i");

/** Social/link-preview crawlers (Slack, Discord, X, …) that should see OG tags. */
export function isPreviewBot(userAgent: string | null): boolean {
  return !!userAgent && previewBotRegex.test(userAgent);
}

export function isAnyBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return isbot(userAgent) || isPreviewBot(userAgent);
}

export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  const bot = isAnyBot(userAgent);
  if (!userAgent) {
    return {
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      deviceType: "other",
      isBot: false,
    };
  }
  const result = UAParser(userAgent);
  const deviceType: DeviceType = bot
    ? "bot"
    : result.device.type === "mobile"
      ? "mobile"
      : result.device.type === "tablet"
        ? "tablet"
        : result.device.type === undefined && result.os.name
          ? "desktop"
          : "other";
  return {
    browser: result.browser.name ?? null,
    browserVersion: result.browser.major ?? null,
    os: result.os.name ?? null,
    osVersion: result.os.version ?? null,
    deviceType,
    isBot: bot,
  };
}

/**
 * The platform smart routing sees: iOS, Android, or a desktop OS. `null` for bots, consoles, TVs and
 * anything unrecognised. iPadOS 13+ Safari sends a Mac User-Agent, so those iPads read as desktop.
 */
export function detectPlatform(userAgent: string | null): RoutingPlatform | null {
  if (!userAgent || isAnyBot(userAgent)) return null;
  const { os, device } = UAParser(userAgent);
  if (os.name === "iOS") return "ios";
  if (os.name === "Android") return "android";
  return os.name && device.type === undefined ? "desktop" : null;
}

/** Primary language tag from Accept-Language, e.g. "en-US,en;q=0.9" → "en-US". */
export function primaryLanguage(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null;
  const first = acceptLanguage.split(",")[0]?.split(";")[0]?.trim();
  if (!first || first === "*" || !/^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/.test(first)) return null;
  return first;
}
