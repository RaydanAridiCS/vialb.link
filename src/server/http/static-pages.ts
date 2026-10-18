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
  :root { color-scheme: light dark; --bg:#fff; --fg:#171717; --muted:#737373; --border:#e5e5e5; --btn:#171717; --btn-fg:#fafafa; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0a0a0a; --fg:#fafafa; --muted:#a3a3a3; --border:#262626; --btn:#fafafa; --btn-fg:#171717; } }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--fg);
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { text-align:center; padding:2rem; max-width:28rem; }
  .code { font-size:4rem; font-weight:700; letter-spacing:-.04em; margin:0; }
  p { color:var(--muted); line-height:1.6; }
  kbd { border:1px solid var(--border); border-radius:.375rem; padding:.1rem .4rem; font-family: ui-monospace, monospace; color:var(--fg); }
  a { display:inline-block; margin-top:1rem; background:var(--btn); color:var(--btn-fg); padding:.6rem 1rem; border-radius:.5rem; text-decoration:none; font-weight:500; }
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
