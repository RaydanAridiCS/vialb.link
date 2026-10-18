import { APP_NAME } from "@/lib/constants";
import { escapeHtml } from "@/server/lib/html";

/**
 * Self-contained, script-free 404 page for the redirect route handler (route
 * handlers can't render the React not-found page). Themed via
 * prefers-color-scheme to match the app.
 */
export function notFoundHtml(code: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Link not found · ${escapeHtml(APP_NAME)}</title>
<style>
  :root { color-scheme: light dark; --bg:#faf8f5; --fg:#1a1814; --muted:#6b645a; --border:#e7e1d8; --card:#fffdfa; --accent:#0f7a55; --btn:#1a1814; --btn-fg:#f2ede6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#151311; --fg:#f2ede6; --muted:#a39c91; --border:#35302b; --card:#1e1b18; --accent:#3dbf8a; --btn:#f2ede6; --btn-fg:#151311; } }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--fg);
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { text-align:center; padding:2rem; max-width:28rem; }
  .code { font-size:6rem; font-weight:700; letter-spacing:-.04em; line-height:1; color:var(--accent); margin:0; }
  h1 { font-weight:700; letter-spacing:-.03em; font-size:1.9rem; line-height:1.15; margin:1.25rem 0 .75rem; }
  p { color:var(--muted); line-height:1.6; }
  kbd { background:var(--card); border:1px solid var(--border); border-radius:.375rem; padding:.1rem .4rem; font-family: ui-monospace, monospace; color:var(--fg); }
  a { display:inline-block; margin-top:1rem; background:var(--btn); color:var(--btn-fg); padding:.7rem 1.1rem; border-radius:.6rem; text-decoration:none; font-weight:500; }
</style>
</head>
<body>
<main>
  <p class="code">404</p>
  <h1>This short link doesn't exist</h1>
  <p>No link matches <kbd>/${escapeHtml(code)}</kbd>. It may have been mistyped or deleted.</p>
  <a href="/">Go to ${escapeHtml(APP_NAME)}</a>
</main>
</body>
</html>`;
}
