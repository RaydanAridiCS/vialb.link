import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { BROWSER_UA, uniqueCode } from "./helpers";

const DESTINATION = "https://news.example/story";
const META_ID = "123456789012345";
const GOOGLE_ID = "G-ABCD1234";

/** Creates a link with both pixels through the form. */
async function createPixelLink(page: Page) {
  const code = uniqueCode("px");
  await page.goto("/dashboard/links/new");
  await page.getByLabel("Long URL").fill(DESTINATION);
  await page.getByLabel("Custom code (optional)").fill(code);
  await page.getByText("Retargeting pixels", { exact: true }).click();
  await page.getByLabel("Meta Pixel ID").fill(META_ID);
  await page.getByLabel("Google tag ID").fill(GOOGLE_ID.toLowerCase());
  await page.getByTestId("link-submit").click();
  await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);
  return { code, id: page.url().split("/").at(-1) ?? "" };
}

function visit(request: APIRequestContext, code: string, headers: Record<string, string> = {}) {
  return request.get(`/${code}`, { maxRedirects: 0, headers: { "user-agent": BROWSER_UA, ...headers } });
}

/** Stubs the destination and both ad platforms, and records which of them were asked for. */
async function stubNetwork(page: Page) {
  const requested: string[] = [];
  await page.route("https://news.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<h1>The story</h1>" }),
  );
  await page.route(/connect\.facebook\.net|googletagmanager\.com/, (route) => {
    requested.push(new URL(route.request().url()).hostname);
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "/* stub */" });
  });
  return requested;
}

test.describe("retargeting pixels", () => {
  test("a link with pixels answers with the consent page, locked down by its own CSP", async ({
    page,
    request,
  }) => {
    const { code } = await createPixelLink(page);
    const response = await visit(request, code);

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    const csp = response.headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("https://www.facebook.com");
    expect(csp).toContain("default-src 'none'");

    const html = await response.text();
    const nonce = /<script nonce="([^"]+)"/.exec(html)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(html).toContain(`data-meta="${META_ID}"`);
    expect(html).toContain(`data-google="${GOOGLE_ID}"`);
    expect(html).toContain("Accept and continue");
  });

  test("nothing from Meta or Google loads until the visitor accepts, then they are forwarded", async ({
    page,
    context,
  }) => {
    const { code } = await createPixelLink(page);
    const requested = await stubNetwork(page);

    await page.goto(`/${code}`);
    await expect(page.getByRole("button", { name: "Accept and continue" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(requested).toEqual([]);

    await page.getByRole("button", { name: "Accept and continue" }).click();
    await page.waitForURL(DESTINATION);
    expect(requested).toContain("connect.facebook.net");
    expect(requested).toContain("www.googletagmanager.com");
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "vialb_consent")?.value).toBe("granted");

    // The next visit remembers the answer: no prompt, the tags run, and the visitor moves on.
    requested.length = 0;
    await page.goto(`/${code}`);
    await page.waitForURL(DESTINATION);
    expect(requested).toContain("connect.facebook.net");
  });

  test("declining forwards immediately without loading any tag, and is remembered", async ({
    page,
    context,
    request,
  }) => {
    const { code } = await createPixelLink(page);
    const requested = await stubNetwork(page);

    await page.goto(`/${code}`);
    await page.getByRole("button", { name: "Continue without tracking" }).click();
    await page.waitForURL(DESTINATION);
    expect(requested).toEqual([]);
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "vialb_consent")?.value).toBe("denied");

    // After a "no" the link is an ordinary redirect again.
    const again = await visit(request, code, { cookie: "vialb_consent=denied" });
    expect(again.status()).toBe(302);
    expect(again.headers()["location"]).toBe(DESTINATION);
  });

  test("visitors who send Global Privacy Control or Do Not Track are redirected straight away", async ({
    page,
    request,
  }) => {
    const { code } = await createPixelLink(page);
    const signals: Record<string, string>[] = [
      { "sec-gpc": "1" },
      { dnt: "1" },
      { "sec-gpc": "1", cookie: "vialb_consent=granted" },
    ];
    for (const signal of signals) {
      const response = await visit(request, code, signal);
      expect(response.status()).toBe(302);
      expect(response.headers()["location"]).toBe(DESTINATION);
    }
  });

  test("link-preview bots get the preview, not the pixel page", async ({ page, request }) => {
    const { code } = await createPixelLink(page);
    const bot = await visit(request, code, { "user-agent": "Slackbot-LinkExpanding 1.0" });
    expect(bot.status()).toBe(200);
    // The preview keeps its own CSP (the proxy leaves short-code responses to the route).
    expect(bot.headers()["content-security-policy"]).toContain("default-src 'none'");
    const html = await bot.text();
    expect(html).toContain("og:title");
    expect(html).not.toContain(META_ID);
    expect(html).not.toContain("Accept and continue");
  });

  test("the saved pixels come back when the link is edited, and can be removed", async ({
    page,
    request,
  }) => {
    const { code, id } = await createPixelLink(page);
    await page.goto(`/dashboard/links/${id}/edit`);
    await expect(page.getByLabel("Meta Pixel ID")).toHaveValue(META_ID);
    await expect(page.getByLabel("Google tag ID")).toHaveValue(GOOGLE_ID);

    await page.getByLabel("Meta Pixel ID").fill("");
    await page.getByLabel("Google tag ID").fill("");
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);

    const response = await visit(request, code);
    expect(response.status()).toBe(302);
  });

  test("a bad ID is explained next to the field", async ({ page }) => {
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill(DESTINATION);
    await page.getByText("Retargeting pixels", { exact: true }).click();
    await page.getByLabel("Meta Pixel ID").fill("not-a-pixel");
    await page.getByTestId("link-submit").click();
    await expect(page.getByText("A Meta Pixel ID is 8 to 20 digits")).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/links\/new$/);
  });

  test("a password and pixels cannot be combined", async ({ page }) => {
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill(DESTINATION);
    await page.getByLabel("Password (optional)").fill("a-long-password");
    await page.getByText("Retargeting pixels", { exact: true }).click();
    await page.getByLabel("Meta Pixel ID").fill(META_ID);
    await page.getByTestId("link-submit").click();
    await expect(
      page.getByText("Retargeting pixels can't be used on a password-protected link"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/links\/new$/);
  });

  test("an administrator can switch pixels off for the whole instance", async ({ page, request }) => {
    const { code } = await createPixelLink(page);
    expect((await visit(request, code)).status()).toBe(200);

    await page.goto("/admin");
    await page.getByLabel("Retargeting pixels").click();
    await page.getByRole("option", { name: "Off" }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Instance settings saved")).toBeVisible();
    try {
      // The settings are cached for a few seconds.
      await expect.poll(async () => (await visit(request, code)).status(), { timeout: 15_000 }).toBe(302);
    } finally {
      await page.getByLabel("Retargeting pixels").click();
      await page.getByRole("option", { name: /^Default/ }).click();
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Instance settings saved").last()).toBeVisible();
    }
  });
});
