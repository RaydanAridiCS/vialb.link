import { APP_NAME } from "@/lib/constants";
import type { InstanceBranding } from "@/lib/branding";
import { escapeHtml } from "@/server/lib/html";

/**
 * Self-contained, script-free pages for the redirect route handler (route handlers can't render the React
 * pages): "not found", "gone" and the optional preview before a redirect. Themed with prefers-color-scheme to
 * match the app, and branded per instance. Every value that reaches the HTML is escaped; the accent colour is
 * validated as `#RRGGBB` before it is stored.
 */

export type GoneReason = "expired" | "limit" | "disabled";

const GONE_TEXT: Record<GoneReason, { title: string; body: string }> = {
  expired: {
    title: "This link has expired",
    body: "The owner set this link to stop working after a certain date.",
  },
  limit: {
    title: "This link reached its visit limit",
    body: "The owner allowed only a limited number of visits, and they've all been used.",
  },
  disabled: {
    title: "This link has been disabled",
    body: "The owner or an administrator turned this link off.",
  },
};

export function isGoneReason(value: unknown): value is GoneReason {
  return value === "expired" || value === "limit" || value === "disabled";
}

/** The CSP of these pages: nothing runs, styles are inline, and images only load when a logo is configured. */
export function staticPageCsp(branding: InstanceBranding = {}): string {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    ...(branding.logoUrl ? ["img-src https:"] : []),
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

interface PageParts {
  title: string;
  /** The large number, or nothing. */
  status?: string;
  heading: string;
  /** Trusted HTML, built from escaped parts. */
  bodyHtml: string;
  branding: InstanceBranding;
  testId?: string;
  attributes?: string;
  /** The closing "home" button; pages with their own actions leave it out. */
  home?: boolean;
}

function page({
  title,
  status,
  heading,
  bodyHtml,
  branding,
  testId,
  attributes,
  home = true,
}: PageParts): string {
  const name = branding.brandName ?? APP_NAME;
  const accent = branding.accentColor
    ? `:root, :root { --accent:${escapeHtml(branding.accentColor)}; --btn:${escapeHtml(branding.accentColor)}; --btn-fg:#ffffff; }
  @media (prefers-color-scheme: dark) { :root { --accent:${escapeHtml(branding.accentColor)}; --btn:${escapeHtml(branding.accentColor)}; --btn-fg:#ffffff; } }`
    : "";
  const homeUrl = branding.homeUrl ?? "/";
  const homeLabel = branding.homeLabel ?? `Go to ${name}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} · ${escapeHtml(name)}</title>
<style>
  :root { color-scheme: light dark; --bg:#faf8f5; --fg:#1a1814; --muted:#6b645a; --border:#e7e1d8; --card:#fffdfa; --accent:#0f7a55; --btn:#1a1814; --btn-fg:#f2ede6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#151311; --fg:#f2ede6; --muted:#a39c91; --border:#35302b; --card:#1e1b18; --accent:#3dbf8a; --btn:#f2ede6; --btn-fg:#151311; } }
  ${accent}
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--fg);
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { text-align:center; padding:2rem; max-width:30rem; }
  .logo { max-height:3rem; max-width:12rem; margin:0 auto 1.5rem; display:block; }
  .code { font-size:6rem; font-weight:700; letter-spacing:-.04em; line-height:1; color:var(--accent); margin:0; }
  h1 { font-weight:700; letter-spacing:-.03em; font-size:1.9rem; line-height:1.15; margin:1.25rem 0 .75rem; }
  p { color:var(--muted); line-height:1.6; }
  kbd, .url { background:var(--card); border:1px solid var(--border); border-radius:.375rem; padding:.1rem .4rem; font-family: ui-monospace, monospace; color:var(--fg); }
  .url { display:block; padding:.6rem .8rem; word-break:break-all; text-align:left; font-size:.9rem; }
  .host { font-size:1.15rem; font-weight:600; color:var(--fg); word-break:break-all; }
  a.button { display:inline-block; margin-top:1rem; background:var(--btn); color:var(--btn-fg); padding:.7rem 1.1rem; border-radius:.6rem; text-decoration:none; font-weight:500; }
  a.quiet { display:inline-block; margin:1rem .75rem 0; color:var(--muted); font-size:.95rem; }
</style>
</head>
<body>
<main${testId ? ` data-testid="${escapeHtml(testId)}"` : ""}${attributes ?? ""}>
  ${branding.logoUrl ? `<img class="logo" src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(name)}">` : ""}
  ${status ? `<p class="code">${escapeHtml(status)}</p>` : ""}
  <h1>${escapeHtml(heading)}</h1>
  ${bodyHtml}
  ${home ? `<a class="button" href="${escapeHtml(homeUrl)}">${escapeHtml(homeLabel)}</a>` : ""}
</main>
</body>
</html>`;
}

export function notFoundHtml(code: string, branding: InstanceBranding = {}): string {
  const message = branding.notFoundMessage;
  return page({
    title: "Link not found",
    status: "404",
    heading: "This short link doesn't exist",
    bodyHtml: `<p>${
      message
        ? escapeHtml(message)
        : `No link matches <kbd>/${escapeHtml(code)}</kbd>. It may have been mistyped or deleted.`
    }</p>`,
    branding,
  });
}

/** The page for expired, disabled and limit-reached links. Served with HTTP 410. */
export function goneHtml(reason: GoneReason, code: string, branding: InstanceBranding = {}): string {
  const text = GONE_TEXT[reason];
  return page({
    title: "Link unavailable",
    status: "410",
    heading: text.title,
    bodyHtml: `<p><kbd>/${escapeHtml(code)}</kbd></p><p>${escapeHtml(branding.goneMessage ?? text.body)}</p>`,
    branding,
    testId: "gone-page",
    attributes: ` data-reason="${reason}"`,
  });
}

/**
 * "You are about to leave": shown instead of redirecting when a link asks for a preview. Plain anchor, no
 * scripts, no automatic redirect, so a visitor can see where they are going before they go.
 */
export function interstitialHtml(
  destination: string,
  code: string,
  branding: InstanceBranding = {},
  /** The instance's `REFERRER_POLICY`, applied to the Continue link like it is to redirects. */
  referrerPolicy = "strict-origin-when-cross-origin",
): string {
  let host = destination;
  try {
    host = new URL(destination).host;
  } catch {
    // The destination was validated when saved; fall back to showing it whole.
  }
  const safe = /^https?:\/\//i.test(destination) ? destination : "/";
  return page({
    title: "Before you go",
    heading: "You are about to leave",
    bodyHtml: `<p>The short link <kbd>/${escapeHtml(code)}</kbd> sends you to</p>
  <p class="host" data-testid="interstitial-host">${escapeHtml(host)}</p>
  <p class="url" data-testid="interstitial-url">${escapeHtml(destination)}</p>
  <a class="button" data-testid="interstitial-continue" href="${escapeHtml(safe)}" rel="noopener nofollow" referrerpolicy="${escapeHtml(referrerPolicy)}">Continue to ${escapeHtml(host)}</a>
  <a class="quiet" href="/">Go back</a>`,
    branding,
    testId: "interstitial",
    home: false,
  });
}
