"use client";

import { useEffect } from "react";

// Replaces the root layout, so it carries its own styles and follows the OS color scheme.
const STYLES = `
  :root { color-scheme: light dark; --bg:#faf8f5; --fg:#1a1814; --muted:#6b645a; --accent:#0f7a55; --btn:#1a1814; --btn-fg:#f2ede6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#151311; --fg:#f2ede6; --muted:#a39c91; --accent:#3dbf8a; --btn:#f2ede6; --btn-fg:#151311; } }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--fg);
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { text-align:center; padding:2rem; max-width:28rem; }
  .code { font-size:6rem; font-weight:700; letter-spacing:-.04em; line-height:1; color:var(--accent); margin:0; }
  h1 { font-weight:700; letter-spacing:-.03em; font-size:1.9rem; margin:1.25rem 0 .75rem; }
  p { color:var(--muted); line-height:1.6; }
  button { margin-top:1rem; background:var(--btn); color:var(--btn-fg); border:0; padding:.7rem 1.1rem; border-radius:.6rem; font:inherit; font-weight:500; cursor:pointer; }
`;

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>Something went wrong</title>
        <style>{STYLES}</style>
      </head>
      <body>
        <main>
          <p className="code" aria-hidden>
            500
          </p>
          <h1>Something went wrong</h1>
          <p>The app could not load this page. Try again in a moment.</p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
