import { expect, test } from "@playwright/test";
import { withDb } from "./db";
import { BROWSER_UA, createLinkViaForm } from "./helpers";

test.describe("short links", () => {
  test("create → visit (302) → analytics shows the click", async ({ page, request }) => {
    const { id, code } = await createLinkViaForm(page, { url: "https://example.com/landing?ref=1" });

    const response = await request.get(`/${code}?utm_source=e2e`, {
      maxRedirects: 0,
      headers: { "user-agent": BROWSER_UA, referer: "https://news.example/thread" },
    });
    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe("https://example.com/landing?ref=1&utm_source=e2e");
    expect(response.headers()["cache-control"]).toContain("no-store");

    // The click is recorded after the response; poll the analytics page.
    await expect(async () => {
      await page.goto(`/dashboard/links/${id}`);
      await expect(page.getByTestId("analytics-kpis").getByText("1", { exact: true }).first()).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByText("news.example").first()).toBeVisible();
    await expect(page.getByText("e2e", { exact: true }).first()).toBeVisible();
  });

  test("preview bots get escaped OG tags and do not consume access", async ({ page, request }) => {
    const { code } = await createLinkViaForm(page, { url: "https://example.com/og", accessLimit: "1 visit" });
    const bot = await request.get(`/${code}`, {
      maxRedirects: 0,
      headers: { "user-agent": "Slackbot-LinkExpanding 1.0" },
    });
    expect(bot.status()).toBe(200);
    expect(await bot.text()).toContain('property="og:url"');
    const human = await request.get(`/${code}`, { maxRedirects: 0, headers: { "user-agent": BROWSER_UA } });
    expect(human.status()).toBe(302);
  });

  test("password-protected link flow", async ({ page, browser }) => {
    const { code } = await createLinkViaForm(page, {
      url: "https://example.com/secret",
      password: "open-sesame",
    });

    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const v = await visitor.newPage();
    await v.route("https://example.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Secret destination</h1>" }),
    );

    // Bots never see the destination of a protected link.
    const preview = await visitor.request.get(`/${code}`, {
      maxRedirects: 0,
      headers: { "user-agent": "Twitterbot/1.0" },
    });
    expect(await preview.text()).not.toContain("example.com/secret");

    await v.goto(`/${code}`);
    await expect(v).toHaveURL(new RegExp(`/p/${code}$`));
    await v.getByLabel("Password").fill("wrong-password");
    await v.getByRole("button", { name: "Continue" }).click();
    await expect(v.locator("#unlock-error")).toContainText("Incorrect password");
    await v.getByLabel("Password").fill("open-sesame");
    await v.getByRole("button", { name: "Continue" }).click();
    await expect(v.getByRole("heading", { name: "Secret destination" })).toBeVisible();
    await visitor.close();
  });

  test("expired link shows the gone page", async ({ page }) => {
    const { id, code } = await createLinkViaForm(page, { url: "https://example.com/old" });
    await withDb((sql) => sql`update links set expires_at = now() - interval '1 minute' where id = ${id}`);
    await page.goto(`/${code}`);
    await expect(page).toHaveURL(new RegExp(`/gone/${code}\\?reason=expired`));
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  });

  test("access limit 1: second visit is gone", async ({ page, request }) => {
    const { code } = await createLinkViaForm(page, {
      url: "https://example.com/once",
      accessLimit: "1 visit",
    });
    const first = await request.get(`/${code}`, { maxRedirects: 0, headers: { "user-agent": BROWSER_UA } });
    expect(first.status()).toBe(302);
    const second = await request.get(`/${code}`, { maxRedirects: 0, headers: { "user-agent": BROWSER_UA } });
    expect(second.status()).toBe(302);
    expect(second.headers()["location"]).toBe(`/gone/${code}?reason=limit`);
  });

  test("unknown codes return 404 and legacy /s/ links redirect", async ({ request }) => {
    expect((await request.get("/definitely-not-a-code", { maxRedirects: 0 })).status()).toBe(404);
    const legacy = await request.get("/s/abc123?x=1", { maxRedirects: 0 });
    expect(legacy.status()).toBe(308);
    expect(legacy.headers()["location"]).toBe("/abc123?x=1");
  });

  test("links table search, disable and delete", async ({ page }) => {
    const { code } = await createLinkViaForm(page, { url: "https://example.com/table" });
    await page.goto("/dashboard/links");
    await page.getByLabel("Search links").fill(code);
    await expect(page.getByTestId("link-row")).toHaveCount(1);
    await page.getByRole("button", { name: `Actions for /${code}` }).click();
    await page.getByRole("menuitem", { name: "Disable" }).click();
    await expect(page.getByTestId("link-row").getByText("Disabled")).toBeVisible();
    await page.getByRole("button", { name: `Actions for /${code}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("No links match these filters.")).toBeVisible();
  });
});
