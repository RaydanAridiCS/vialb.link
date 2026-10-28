import { expect, test } from "@playwright/test";
import { withDb } from "./db";
import { BROWSER_UA, createLinkViaForm } from "./helpers";

/**
 * Click analytics, access limits and expiry only work if no browser or CDN ever
 * answers a short link from cache, so every branch of the redirect path must say so.
 */
test.describe("cache headers on the redirect path", () => {
  const humanHeaders = { "user-agent": BROWSER_UA };

  function expectNoStore(headers: Record<string, string>) {
    expect(headers["cache-control"]).toContain("no-store");
  }

  test("redirect, bot preview, HEAD and unknown codes are never cached", async ({ page, request }) => {
    const { code } = await createLinkViaForm(page, { url: "https://example.com/cache" });

    const redirect = await request.get(`/${code}`, { maxRedirects: 0, headers: humanHeaders });
    expect(redirect.status()).toBe(302);
    expectNoStore(redirect.headers());

    const preview = await request.get(`/${code}`, {
      maxRedirects: 0,
      headers: { "user-agent": "Slackbot-LinkExpanding 1.0" },
    });
    expect(preview.status()).toBe(200);
    expectNoStore(preview.headers());

    const head = await request.head(`/${code}`, { maxRedirects: 0, headers: humanHeaders });
    expectNoStore(head.headers());

    const missing = await request.get("/definitely-not-a-code", { maxRedirects: 0 });
    expect(missing.status()).toBe(404);
    expectNoStore(missing.headers());
  });

  test("gone redirect and the gone page are never cached", async ({ page, request }) => {
    const { id, code } = await createLinkViaForm(page, { url: "https://example.com/gone-cache" });
    await withDb((sql) => sql`update links set expires_at = now() - interval '1 minute' where id = ${id}`);

    const gone = await request.get(`/${code}`, { maxRedirects: 0, headers: humanHeaders });
    expect(gone.status()).toBe(410);
    expectNoStore(gone.headers());

    const goneView = await request.get(`/gone/${code}?reason=expired`, { maxRedirects: 0 });
    expect(goneView.status()).toBe(410);
    expectNoStore(goneView.headers());
  });

  test("password redirect and the password page are never cached", async ({ page, request }) => {
    const { code } = await createLinkViaForm(page, {
      url: "https://example.com/pw-cache",
      password: "open-sesame",
    });

    const challenge = await request.get(`/${code}`, { maxRedirects: 0, headers: humanHeaders });
    expect(challenge.status()).toBe(307);
    expectNoStore(challenge.headers());

    const form = await request.get(`/p/${code}`, { maxRedirects: 0 });
    expect(form.status()).toBe(200);
    expectNoStore(form.headers());
  });

  test("the legacy /s/ redirect is never cached", async ({ request }) => {
    const legacy = await request.get("/s/abc123", { maxRedirects: 0 });
    expect(legacy.status()).toBe(308);
    expectNoStore(legacy.headers());
  });
});
