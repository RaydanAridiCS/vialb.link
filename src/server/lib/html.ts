const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
};

/** Escapes text for safe use in HTML text nodes AND quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'`]/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

export interface PreviewMeta {
  siteName: string;
  /** Canonical short URL (never the destination for protected links). */
  shortUrl: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  /** Only set for unprotected links. */
  destinationUrl: string | null;
}

/**
 * Minimal HTML document for link-preview crawlers. Contains only escaped
 * meta tags: no scripts, no meta-refresh, and no destination for protected
 * links (the caller passes `destinationUrl: null`).
 */
export function renderPreviewHtml(meta: PreviewMeta): string {
  const tags: [string, string, string][] = [
    ["property", "og:type", "website"],
    ["property", "og:site_name", meta.siteName],
    ["property", "og:title", meta.title],
    ["property", "og:url", meta.shortUrl],
    ["name", "twitter:title", meta.title],
  ];
  if (meta.description) {
    tags.push(["name", "description", meta.description]);
    tags.push(["property", "og:description", meta.description]);
    tags.push(["name", "twitter:description", meta.description]);
  }
  if (meta.imageUrl) {
    tags.push(["property", "og:image", meta.imageUrl]);
    tags.push(["name", "twitter:image", meta.imageUrl]);
    tags.push(["name", "twitter:card", "summary_large_image"]);
  } else {
    tags.push(["name", "twitter:card", "summary"]);
  }

  const metaTags = tags
    .map(([attr, key, value]) => `<meta ${attr}="${escapeHtml(key)}" content="${escapeHtml(value)}">`)
    .join("\n    ");
  const body = meta.destinationUrl
    ? `<p>${escapeHtml(meta.title)}</p><p>${escapeHtml(meta.destinationUrl)}</p>`
    : `<p>${escapeHtml(meta.title)}</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="robots" content="noindex, nofollow">
    <title>${escapeHtml(meta.title)}</title>
    ${metaTags}
  </head>
  <body>${body}</body>
</html>`;
}
