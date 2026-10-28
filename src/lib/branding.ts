import { HEX_COLOR_PATTERN } from "@/lib/constants";

/** What an instance admin can change about the 404 and "gone" pages. Every field is optional. */
export interface InstanceBranding {
  /** Shown instead of the product name on those pages. */
  brandName?: string;
  /** `#RRGGBB`; colours the big status number and the button. */
  accentColor?: string;
  /** An https image shown above the message. */
  logoUrl?: string;
  notFoundMessage?: string;
  goneMessage?: string;
  homeLabel?: string;
  /** A path on this site (`/pricing`) or an http(s) address. */
  homeUrl?: string;
}

export const BRANDING_LIMITS = {
  brandName: 40,
  message: 200,
  homeLabel: 30,
  url: 500,
} as const;

/** Relative luminance of `#RRGGBB` (WCAG). */
function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Contrast ratio of a colour against white, which is the text colour on the button. */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

function isHttps(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSafeHome(value: string): boolean {
  if (value.startsWith("/"))
    return !value.startsWith("//") && !value.includes("\\") && !/[\u0000-\u001f]/.test(value);
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export interface BrandingResult {
  value: InstanceBranding;
  /** One message per problem; empty when the branding can be saved. */
  problems: string[];
}

/**
 * Trims every field, drops the empty ones and checks the rest. Pure: the admin form, the server action and the
 * pages that render it all rely on the same rules, and nothing here ever produces HTML.
 */
export function cleanBranding(input: InstanceBranding | null | undefined): BrandingResult {
  const value: InstanceBranding = {};
  const problems: string[] = [];
  const take = (key: keyof InstanceBranding, max: number, label: string) => {
    const text = (input?.[key] ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    if (text === "") return null;
    if (text.length > max) problems.push(`${label} can be at most ${max} characters`);
    return text;
  };

  const brandName = take("brandName", BRANDING_LIMITS.brandName, "The name");
  if (brandName) value.brandName = brandName;
  const notFound = take("notFoundMessage", BRANDING_LIMITS.message, "The not-found message");
  if (notFound) value.notFoundMessage = notFound;
  const gone = take("goneMessage", BRANDING_LIMITS.message, "The gone message");
  if (gone) value.goneMessage = gone;
  const homeLabel = take("homeLabel", BRANDING_LIMITS.homeLabel, "The button label");
  if (homeLabel) value.homeLabel = homeLabel;

  const color = (input?.accentColor ?? "").trim();
  if (color !== "") {
    if (!HEX_COLOR_PATTERN.test(color)) problems.push("The accent colour must look like #1A7F5A");
    else if (contrastWithWhite(color) < 3)
      problems.push("The accent colour is too light for white button text");
    else value.accentColor = color.toUpperCase();
  }

  const logo = (input?.logoUrl ?? "").trim();
  if (logo !== "") {
    if (logo.length > BRANDING_LIMITS.url || !isHttps(logo))
      problems.push("The logo must be an https:// image address");
    else value.logoUrl = logo;
  }

  const home = (input?.homeUrl ?? "").trim();
  if (home !== "") {
    if (home.length > BRANDING_LIMITS.url || !isSafeHome(home)) {
      problems.push("The button link must be a path like /pricing or an http(s) address");
    } else value.homeUrl = home;
  }
  return { value, problems };
}
