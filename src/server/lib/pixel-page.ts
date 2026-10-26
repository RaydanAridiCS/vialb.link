import { GOOGLE_TAG_PATTERN, META_PIXEL_PATTERN, PIXEL_LABELS, type LinkPixels } from "@/lib/pixels";
import { escapeHtml } from "./html";

/**
 * The page a visitor sees on a link that uses retargeting pixels. It is built as a plain string (no
 * React, no layout) so it adds almost nothing to the redirect, and it loads nothing from an ad
 * platform until the visitor agrees. Every value that reaches the script travels in an escaped
 * `data-*` attribute; the script itself is a constant, so there is nothing to inject into.
 */

export interface PixelPageInput {
  destination: string;
  pixels: LinkPixels;
  /** `granted`: the visitor agreed before, so tags load straight away. `ask`: wait for a choice. */
  mode: "ask" | "granted";
  nonce: string;
}

/**
 * Beacon endpoints the tags talk to. The scripts themselves are allowed through `strict-dynamic`
 * (they are added by our nonced script), so only the places they send data need listing.
 */
export function pixelPageCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'nonce-${nonce}'`,
    "img-src https: data:",
    [
      "connect-src https://www.facebook.com https://connect.facebook.net",
      "https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com",
      "https://*.g.doubleclick.net https://www.google.com https://pagead2.googlesyndication.com",
    ].join(" "),
    "frame-src https://www.googletagmanager.com",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Constant script: reads its settings from `<body data-*>`, so no visitor-controlled text is ever executed. */
const SCRIPT = `(function () {
  var data = document.body.dataset;
  var dest = data.dest;
  var finished = false;
  function remember(value) {
    try {
      document.cookie = "vialb_consent=" + value + "; Max-Age=15552000; Path=/; SameSite=Lax" +
        (location.protocol === "https:" ? "; Secure" : "");
    } catch (e) {}
  }
  function go() { location.replace(dest); }
  function load(src, done) {
    var el = document.createElement("script");
    el.async = true;
    el.src = src;
    el.onload = el.onerror = done;
    document.head.appendChild(el);
  }
  function run() {
    var pending = 0;
    function finish() {
      if (finished) return;
      finished = true;
      setTimeout(go, 300);
    }
    function track() {
      pending++;
      return function () { if (--pending === 0) finish(); };
    }
    if (data.meta) {
      var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!window._fbq) window._fbq = n;
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      n("init", data.meta);
      n("track", "PageView");
      load("https://connect.facebook.net/en_US/fbevents.js", track());
    }
    if (data.google) {
      window.dataLayer = window.dataLayer || [];
      if (data.google.indexOf("GTM-") === 0) {
        window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
        load("https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(data.google), track());
      } else {
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag("js", new Date());
        window.gtag("config", data.google);
        load("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(data.google), track());
      }
    }
    if (pending === 0) finish();
    setTimeout(finish, 1500);
  }
  function show(id) { var el = document.getElementById(id); if (el) el.hidden = false; }
  if (data.mode === "granted") {
    show("working");
    run();
  } else {
    show("ask");
    document.getElementById("accept").onclick = function () {
      remember("granted");
      document.getElementById("ask").hidden = true;
      show("working");
      run();
    };
    document.getElementById("decline").onclick = function () {
      remember("denied");
      go();
    };
  }
})();`;

const STYLE = `
  :root { color-scheme: light dark; --bg: #f6f7f9; --card: #ffffff; --text: #16181d; --muted: #5c6370; --line: #dfe2e8; --accent: #1d4ed8; --accent-text: #ffffff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #101215; --card: #181b20; --text: #eceef2; --muted: #a2a8b3; --line: #2b3038; --accent: #5b8def; --accent-text: #0b1020; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { width: 100%; max-width: 420px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 24px; }
  h1 { margin: 0 0 8px; font-size: 1.25rem; }
  p { margin: 0 0 16px; color: var(--muted); overflow-wrap: anywhere; }
  .dest { color: var(--text); font-weight: 600; }
  .actions { display: grid; gap: 8px; }
  button, .link { font: inherit; border-radius: 8px; padding: 10px 14px; border: 1px solid var(--line); background: transparent; color: var(--text); cursor: pointer; text-align: center; text-decoration: none; }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }
  [hidden] { display: none !important; }
`;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Human list of the tags in use: "Meta Pixel and Google tag". */
function describePixels(pixels: LinkPixels): string {
  const names = [pixels.meta ? PIXEL_LABELS.meta : null, pixels.google ? PIXEL_LABELS.google : null];
  return names.filter(Boolean).join(" and ");
}

/**
 * Returns the page, or `null` when an input is not safe to render (a destination that is not http(s),
 * or an ID that does not match its pattern). Callers then fall back to a plain redirect, so a bad
 * stored value can break the pixel but never the link.
 */
export function renderPixelPage(input: PixelPageInput): string | null {
  const { destination, pixels, nonce } = input;
  if (!/^https?:\/\//i.test(destination)) return null;
  if (pixels.meta !== undefined && !META_PIXEL_PATTERN.test(pixels.meta)) return null;
  if (pixels.google !== undefined && !GOOGLE_TAG_PATTERN.test(pixels.google)) return null;

  const attrs = [
    `data-mode="${input.mode}"`,
    `data-dest="${escapeHtml(destination)}"`,
    ...(pixels.meta ? [`data-meta="${escapeHtml(pixels.meta)}"`] : []),
    ...(pixels.google ? [`data-google="${escapeHtml(pixels.google)}"`] : []),
  ].join(" ");
  const host = escapeHtml(hostOf(destination));
  const tags = escapeHtml(describePixels(pixels));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <title>Continue to ${host}</title>
    <style nonce="${nonce}">${STYLE}</style>
  </head>
  <body ${attrs}>
    <main>
      <div id="ask" hidden>
        <h1>Before you continue</h1>
        <p>This link is set up with advertising tags (${tags}). If you accept, they run for a moment and may set cookies. You are going to <span class="dest">${host}</span>.</p>
        <div class="actions">
          <button id="accept" class="primary" type="button">Accept and continue</button>
          <button id="decline" type="button">Continue without tracking</button>
        </div>
      </div>
      <div id="working" hidden>
        <h1>Taking you to ${host}</h1>
        <p>One moment…</p>
      </div>
      <noscript>
        <h1>Continue to ${host}</h1>
        <p>Scripts are off, so no advertising tags run.</p>
        <a class="link" href="${escapeHtml(destination)}" rel="noopener">Continue</a>
      </noscript>
    </main>
    <script nonce="${nonce}">${SCRIPT}</script>
  </body>
</html>`;
}
