import { isbot } from "isbot";
import { UAParser } from "ua-parser-js";
import { PREVIEW_BOT_PATTERNS } from "@/lib/constants";
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

/** Primary language tag from Accept-Language, e.g. "en-US,en;q=0.9" → "en-US". */
export function primaryLanguage(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null;
  const first = acceptLanguage.split(",")[0]?.split(";")[0]?.trim();
  if (!first || first === "*" || !/^[A-Za-z]{1,8}(-[A-Za-z0-9]{1,8})*$/.test(first)) return null;
  return first;
}
