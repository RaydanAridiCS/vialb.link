import { BIO_RESERVED_HANDLES, LIMITS } from "@/lib/constants";

/**
 * Link-in-bio rules shared by the dashboard form and the server. Pure: no I/O, so the same code
 * validates in the browser and again in `BioService`.
 */

export const HANDLE_PATTERN = /^[a-z0-9_]+$/;

/** Lowercases and drops a leading "@", so "  @Alice " and "alice" are the same handle. */
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** Returns a message for people, or `null` when the (normalized) handle is acceptable. */
export function handleProblem(handle: string): string | null {
  if (handle.length < LIMITS.bioHandleMin || handle.length > LIMITS.bioHandleMax) {
    return `Handles are ${LIMITS.bioHandleMin}-${LIMITS.bioHandleMax} characters`;
  }
  if (!HANDLE_PATTERN.test(handle)) return "Use only letters, numbers and underscores";
  if (BIO_RESERVED_HANDLES.has(handle)) return "This handle is reserved, please choose another";
  return null;
}

export const SOCIAL_PLATFORMS = [
  "website",
  "email",
  "instagram",
  "tiktok",
  "youtube",
  "x",
  "github",
  "linkedin",
  "facebook",
  "twitch",
  "spotify",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface SocialLink {
  platform: SocialPlatform;
  url: string;
}

interface PlatformRule {
  label: string;
  /** Allowed hosts (subdomains such as www. or open. match too). Absent for website and email. */
  hosts?: readonly string[];
  /** Turns a bare handle ("alice" or "@alice") into a profile URL. */
  fromHandle?: (handle: string) => string;
}

export const SOCIAL_RULES: Record<SocialPlatform, PlatformRule> = {
  website: { label: "Website" },
  email: { label: "Email" },
  instagram: {
    label: "Instagram",
    hosts: ["instagram.com"],
    fromHandle: (h) => `https://instagram.com/${h}`,
  },
  tiktok: { label: "TikTok", hosts: ["tiktok.com"], fromHandle: (h) => `https://www.tiktok.com/@${h}` },
  youtube: {
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be"],
    fromHandle: (h) => `https://www.youtube.com/@${h}`,
  },
  x: { label: "X", hosts: ["x.com", "twitter.com"], fromHandle: (h) => `https://x.com/${h}` },
  github: { label: "GitHub", hosts: ["github.com"], fromHandle: (h) => `https://github.com/${h}` },
  linkedin: {
    label: "LinkedIn",
    hosts: ["linkedin.com"],
    fromHandle: (h) => `https://www.linkedin.com/in/${h}`,
  },
  facebook: {
    label: "Facebook",
    hosts: ["facebook.com", "fb.com"],
    fromHandle: (h) => `https://facebook.com/${h}`,
  },
  twitch: { label: "Twitch", hosts: ["twitch.tv"], fromHandle: (h) => `https://twitch.tv/${h}` },
  spotify: { label: "Spotify", hosts: ["spotify.com"] },
};

export function isSocialPlatform(value: string): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

const BARE_HANDLE = /^@?([A-Za-z0-9._-]{1,50})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SocialResult = { ok: true; url: string } | { ok: false; error: string };

function hostMatches(host: string, allowed: readonly string[]): boolean {
  return allowed.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Normalizes what someone typed for a social field into the URL that is stored and rendered.
 * Brand platforms only accept their own hosts, so a "Spotify" button cannot point somewhere else;
 * `website` accepts any http(s) URL (the service additionally runs it through the destination checks).
 */
export function normalizeSocialUrl(platform: SocialPlatform, raw: string): SocialResult {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Enter a value" };
  if (value.length > LIMITS.urlMaxLength) {
    return { ok: false, error: `Links can be at most ${LIMITS.urlMaxLength} characters` };
  }

  if (platform === "email") {
    const address = value.replace(/^mailto:/i, "");
    if (address.length > 254 || !EMAIL.test(address))
      return { ok: false, error: "Enter a valid email address" };
    return { ok: true, url: `mailto:${address}` };
  }

  const rule = SOCIAL_RULES[platform];
  // "alice" or "@alice" is a handle; anything with a dot needs the "@" ("@a.b") so "github.com" stays a host.
  const bare = BARE_HANDLE.exec(value);
  let candidate = value;
  if (bare?.[1] && rule.fromHandle && (value.startsWith("@") || !value.includes("."))) {
    candidate = rule.fromHandle(bare[1]);
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    candidate = `https://${value}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "Enter a valid link" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Links must start with http:// or https://" };
  }
  if (url.username || url.password)
    return { ok: false, error: "Links cannot contain a username or password" };
  const host = url.hostname.toLowerCase();
  if (rule.hosts && !hostMatches(host, rule.hosts)) {
    return { ok: false, error: `This does not look like a link to ${rule.label}` };
  }
  if (platform === "website" && !host.includes(".")) return { ok: false, error: "Enter a valid website" };

  // Brand profiles are always https; a personal website keeps the scheme it was given.
  if (platform !== "website") url.protocol = "https:";
  url.hash = "";
  return { ok: true, url: url.toString() };
}
