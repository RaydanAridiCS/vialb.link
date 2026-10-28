/**
 * Project-wide constants. The product name lives here (and only here) so the
 * project is trivial to rename or white-label.
 */
export const APP_NAME = "Vialb";
export const APP_TAGLINE = "The simple, privacy-friendly open-source link shortener for everyone.";
export const GITHUB_REPO = "RaydanAridiCS/vialb.link";
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;
export const DOCKER_IMAGE = `ghcr.io/${GITHUB_REPO.toLowerCase()}`;

/** Base62 without look-alike characters (0, O, I, l, 1). */
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const CODE_DEFAULT_LENGTH = 7;
export const CODE_MAX_ATTEMPTS_PER_LENGTH = 5;
export const CODE_MAX_LENGTH_GROWTH = 3;
export const CUSTOM_CODE_PATTERN = /^[A-Za-z0-9_-]{3,50}$/;

/**
 * Every top-level route segment (and a few well-known files) that a short code
 * must never shadow. Compared case-insensitively.
 */
export const RESERVED_CODES: ReadonlySet<string> = new Set(
  [
    "api",
    "s",
    "p",
    "gone",
    "dashboard",
    "admin",
    "sign-in",
    "sign-up",
    "sign-out",
    "forgot-password",
    "reset-password",
    "two-factor",
    "verify-email",
    "invite",
    "u",
    "docs",
    "_next",
    "favicon.ico",
    "robots.txt",
    "sitemap.xml",
    "manifest.webmanifest",
    "opengraph-image",
    "twitter-image",
    "icon",
    "apple-icon",
    "health",
    "static",
    "public",
    "assets",
    "login",
    "logout",
    "register",
    "settings",
    "about",
    "privacy",
    "terms",
    "status",
    "www",
    "app",
    "new",
    "qr",
    "demo",
    "stats",
    ".well-known",
  ].map((c) => c.toLowerCase()),
);

/**
 * Bio page handles (`/@handle`) share the short-code reserved list and add names that could pass
 * for the service or its staff. Compared case-insensitively.
 */
export const BIO_RESERVED_HANDLES: ReadonlySet<string> = new Set([
  ...RESERVED_CODES,
  APP_NAME.toLowerCase(),
  "vialb",
  "support",
  "help",
  "staff",
  "team",
  "root",
  "official",
  "security",
  "abuse",
  "contact",
  "billing",
  "null",
  "undefined",
]);

export const LIMITS = {
  urlMaxLength: 2048,
  titleMax: 100,
  tagMaxLength: 30,
  tagsPerLinkMax: 10,
  ogTitleMax: 70,
  ogDescriptionMax: 200,
  passwordMin: 4,
  passwordMax: 128,
  maxClicksMin: 1,
  maxClicksMax: 100_000,
  maxExpiryDays: 365,
  apiKeyNameMax: 64,
  pageSizeMax: 100,
  csvExportMaxRows: 1_000_000,
  blockedDomainsMax: 5000,
  /** CSV import: file size, data rows per file, rows per server call, rows shown in the preview. */
  importMaxBytes: 2 * 1024 * 1024,
  importMaxRows: 1000,
  importBatchSize: 50,
  importPreviewRows: 100,
  /** Link-in-bio pages. */
  bioHandleMin: 3,
  bioHandleMax: 30,
  bioDisplayNameMax: 60,
  bioTextMax: 160,
  bioButtonsMax: 30,
  bioButtonLabelMax: 50,
  bioSocialsMax: 10,
  /** Smart routing: rules per link and countries per rule. */
  routingRulesMax: 10,
  routingCountriesMax: 50,
  /** A/B and percentage splits: arms per rule and the length of an arm's name. */
  routingVariantsMax: 5,
  /** Moving links to another workspace: links per request. */
  moveLinksMax: 100,
  routingVariantLabelMax: 20,
  /** Team workspaces: how many a person may create, members and pending invitations per workspace. */
  workspaceNameMax: 60,
  workspacesPerUserMax: 10,
  workspaceMembersMax: 50,
  workspaceInvitesMax: 50,
  /** Folders: name length and how many a workspace may have. */
  folderNameMax: 40,
  foldersPerWorkspaceMax: 100,
  /** REST bulk import: rows and request size. */
  apiImportMaxRows: 100,
  apiImportMaxBytes: 256 * 1024,
  /** How long an invitation link works. */
  inviteTtlDays: 7,
} as const;

/** Cookie holding the workspace the dashboard is showing. Re-checked against membership on every request. */
export const ACTIVE_WORKSPACE_COOKIE = "vialb_ws";

export const EXPIRATION_PRESETS = [
  "never",
  "10m",
  "1h",
  "6h",
  "12h",
  "24h",
  "48h",
  "7d",
  "30d",
  "custom",
] as const;
export type ExpirationPreset = (typeof EXPIRATION_PRESETS)[number];

export const EXPIRATION_PRESET_MS: Record<Exclude<ExpirationPreset, "never" | "custom">, number> = {
  "10m": 10 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "48h": 48 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export const EXPIRATION_PRESET_LABELS: Record<ExpirationPreset, string> = {
  never: "Never",
  "10m": "10 minutes",
  "1h": "1 hour",
  "6h": "6 hours",
  "12h": "12 hours",
  "24h": "24 hours",
  "48h": "48 hours",
  "7d": "7 days",
  "30d": "30 days",
  custom: "Custom date…",
};

export const ACCESS_LIMIT_PRESETS = ["unlimited", "1", "10", "100", "1000", "custom"] as const;
export type AccessLimitPreset = (typeof ACCESS_LIMIT_PRESETS)[number];

export const ACCESS_LIMIT_PRESET_LABELS: Record<AccessLimitPreset, string> = {
  unlimited: "Unlimited",
  "1": "1 visit",
  "10": "10 visits",
  "100": "100 visits",
  "1000": "1,000 visits",
  custom: "Custom…",
};

export const DEFAULT_QR_FG = "#000000";
export const DEFAULT_QR_BG = "#FFFFFF";
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** Social/link-preview crawlers that get an OG preview instead of a redirect. */
export const PREVIEW_BOT_PATTERNS = [
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "slack-imgproxy",
  "discordbot",
  "telegrambot",
  "whatsapp",
  "applebot",
  "skypeuripreview",
  "pinterest",
  "redditbot",
  "embedly",
  "mastodon",
] as const;

export const RATE_LIMITS = {
  createLinkUser: { limit: 60, windowMs: 60 * 60 * 1000 },
  createLinkAnon: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** One token per import batch (`LIMITS.importBatchSize` rows): 100 batches is about 5 full-size files an hour. */
  importBatches: { limit: 100, windowMs: 60 * 60 * 1000 },
  /** Claiming or changing a bio handle. */
  bioHandle: { limit: 5, windowMs: 24 * 60 * 60 * 1000 },
  /** Bio buttons are links underneath (each one is checked against the blocklist and Safe Browsing). */
  bioButtons: { limit: 60, windowMs: 60 * 60 * 1000 },
  /** Creating workspaces, inviting people, and trying invitation links. */
  workspaceCreate: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
  invite: { limit: 30, windowMs: 60 * 60 * 1000 },
  acceptInvite: { limit: 20, windowMs: 60 * 60 * 1000 },
  passwordPerIpCode: { limit: 10, windowMs: 15 * 60 * 1000 },
  passwordPerCode: { limit: 100, windowMs: 15 * 60 * 1000 },
  apiKey: { limit: 120, windowMs: 60 * 1000 },
  /** The dashboard "Re-check" button; each press makes outbound requests. */
  healthRecheck: { limit: 20, windowMs: 10 * 60 * 1000 },
  /** "Send me a preview" of the weekly report. */
  reportPreview: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Opening public stats pages, per visitor address. */
  publicStats: { limit: 120, windowMs: 60 * 1000 },
  /** Conversion reports: per sending address, and in total per link. */
  convertPerIp: { limit: 120, windowMs: 60 * 1000 },
  convertPerLink: { limit: 1200, windowMs: 60 * 1000 },
} as const;

export const API_KEY_PREFIX = "tw_";
export const ANALYTICS_RANGES = ["24h", "7d", "30d", "90d", "all", "custom"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export const CLAIM_TOKENS_STORAGE_KEY = "vialb:claim-tokens";
/** A team invitation opened before signing in; offered again on the dashboard. */
export const PENDING_INVITE_STORAGE_KEY = "vialb:pending-invite";
/** Fired on `window` when that value changes in this tab (the browser only fires `storage` for other tabs). */
export const PENDING_INVITE_EVENT = "vialb:pending-invite-changed";
