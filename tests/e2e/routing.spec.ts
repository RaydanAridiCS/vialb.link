import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { BROWSER_UA, uniqueCode } from "./helpers";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const PIXEL =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const SITE = "https://app.example/";
const APP_STORE = "https://apps.apple.com/app/id1";
const PLAY = "https://play.google.com/store/apps/details?id=app";

async function openRouting(page: Page) {
  await page.getByText("Smart routing", { exact: true }).click();
}

/** Creates a link through the form with the App Store / Google Play preset. */
async function createStoreLink(page: Page) {
  const code = uniqueCode("rt");
  await page.goto("/dashboard/links/new");
  await page.getByLabel("Long URL").fill(SITE);
  await page.getByLabel("Custom code (optional)").fill(code);
  await openRouting(page);
  await page.getByRole("button", { name: "App Store + Google Play" }).click();
  await page.getByLabel("Destination for rule 1").fill(APP_STORE);
  await page.getByLabel("Destination for rule 2").fill(PLAY);
  await page.getByTestId("link-submit").click();
  await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);
  return { code, id: page.url().split("/").at(-1) ?? "" };
}

function visit(request: APIRequestContext, code: string, headers: Record<string, string>, query = "") {
  return request.get(`/${code}${query}`, { maxRedirects: 0, headers });
}

test.describe("smart routing", () => {
  test("one link sends iPhone, Android and desktop visitors to different places", async ({
    page,
    request,
  }) => {
    const { code } = await createStoreLink(page);

    const ios = await visit(request, code, { "user-agent": IPHONE }, "?utm_source=qr");
    expect(ios.status()).toBe(302);
    expect(ios.headers()["location"]).toBe(`${APP_STORE}?utm_source=qr`);
    expect(ios.headers()["cache-control"]).toContain("no-store");

    const android = await visit(request, code, { "user-agent": PIXEL });
    expect(android.headers()["location"]).toBe(PLAY);

    const desktop = await visit(request, code, { "user-agent": BROWSER_UA });
    expect(desktop.headers()["location"]).toBe(SITE);
  });

  test("link-preview bots still see the normal destination, never the store links", async ({
    page,
    request,
  }) => {
    const { code } = await createStoreLink(page);
    const bot = await visit(request, code, { "user-agent": "Slackbot-LinkExpanding 1.0" });
    expect(bot.status()).toBe(200);
    const html = await bot.text();
    expect(html).toContain("app.example");
    expect(html).not.toContain("apple.com");
    expect(html).not.toContain("play.google.com");
  });

  test("the saved rules come back when the link is edited, and can all be removed", async ({
    page,
    request,
  }) => {
    const { code, id } = await createStoreLink(page);

    await page.goto(`/dashboard/links/${id}/edit`);
    await expect(page.getByText("2 rules")).toBeVisible();
    await expect(page.getByLabel("Destination for rule 1")).toHaveValue(APP_STORE);
    await expect(page.getByLabel("Destination for rule 2")).toHaveValue(PLAY);

    await page.getByRole("button", { name: "Remove rule 2" }).click();
    await page.getByRole("button", { name: "Remove rule 1" }).click();
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);

    const ios = await visit(request, code, { "user-agent": IPHONE });
    expect(ios.headers()["location"]).toBe(SITE);
  });

  test("country rules follow the visitor's country header and combine with the device", async ({
    page,
    request,
  }) => {
    const code = uniqueCode("rtc");
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill(SITE);
    await page.getByLabel("Custom code (optional)").fill(code);
    await openRouting(page);

    await page.getByRole("button", { name: "Add a rule" }).click();
    await page.getByLabel("Countries for rule 1").fill("de, at");
    await page.getByLabel("Destination for rule 1").fill("https://de.example/");

    await page.getByRole("button", { name: "Add a rule" }).click();
    await page.getByRole("combobox", { name: "Device for rule 2" }).click();
    await page.getByRole("option", { name: "iPhone & iPad" }).click();
    await page.getByLabel("Countries for rule 2").fill("FR");
    await page.getByLabel("Destination for rule 2").fill("https://fr-ios.example/");
    await expect(page.getByText(/TRUST_PROXY_GEO_HEADERS/)).toBeVisible();
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);

    const where = async (userAgent: string, country?: string) =>
      (
        await visit(request, code, {
          "user-agent": userAgent,
          ...(country ? { "cf-ipcountry": country } : {}),
        })
      ).headers()["location"];

    expect(await where(BROWSER_UA, "DE")).toBe("https://de.example/");
    expect(await where(PIXEL, "AT")).toBe("https://de.example/");
    expect(await where(IPHONE, "FR")).toBe("https://fr-ios.example/");
    expect(await where(BROWSER_UA, "FR")).toBe(SITE);
    expect(await where(IPHONE, "US")).toBe(SITE);
    expect(await where(IPHONE)).toBe(SITE);
  });

  test("the form tester shows where a visitor would go", async ({ page }) => {
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill(SITE);
    await openRouting(page);
    await page.getByRole("button", { name: "App Store + Google Play" }).click();
    await page.getByLabel("Destination for rule 1").fill(APP_STORE);
    await page.getByLabel("Destination for rule 2").fill(PLAY);

    const result = page.getByTestId("routing-test-result");
    await expect(result).toContainText(`Goes to ${SITE}`);
    await page.getByRole("combobox", { name: "Visitor's device" }).click();
    await page.getByRole("option", { name: "iPhone & iPad" }).click();
    await expect(result).toContainText(APP_STORE);
  });

  test("bad rules are explained next to the rule and nothing is saved", async ({ page }) => {
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill(SITE);
    await page.getByLabel("Custom code (optional)").fill(uniqueCode("rtbad"));
    await openRouting(page);

    await page.getByRole("button", { name: "Add a rule" }).click();
    await page.getByLabel("Destination for rule 1").fill("javascript:alert(1)");
    await page.getByTestId("link-submit").click();
    await expect(page.getByRole("alert").filter({ hasText: /valid http/ })).toBeVisible();

    await page.getByLabel("Destination for rule 1").fill("https://ok.example/");
    await page.getByTestId("link-submit").click();
    await expect(page.getByRole("alert").filter({ hasText: /choose a device/ })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/links\/new$/);
  });

  test("analytics tell which rule sent each visitor", async ({ page, request }) => {
    const { code, id } = await createStoreLink(page);
    await visit(request, code, { "user-agent": IPHONE });
    await visit(request, code, { "user-agent": IPHONE });
    await visit(request, code, { "user-agent": PIXEL });
    await visit(request, code, { "user-agent": BROWSER_UA });

    // Clicks are recorded after the response, so poll the analytics page.
    await expect(async () => {
      await page.goto(`/dashboard/links/${id}`);
      await expect(page.getByText("Where visitors were sent by this link's rules")).toBeVisible({
        timeout: 1000,
      });
      // Two iPhone visits, one Android, one desktop that matched no rule.
      await expect(page.getByText("iPhone & iPad", { exact: true })).toBeVisible();
      await expect(page.getByText("Android", { exact: true })).toBeVisible();
      await expect(page.getByText("Default destination", { exact: true })).toBeVisible();
    }).toPass({ timeout: 15_000 });
  });

  test("the REST API accepts, returns and validates routing rules", async ({ page, request }) => {
    await page.goto("/dashboard/api-keys");
    await page.getByLabel("Name").fill("Routing key");
    await page.getByRole("button", { name: "Create key" }).click();
    const secret = (await page.getByTestId("api-key-secret").textContent())?.trim() ?? "";
    const auth = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

    const code = uniqueCode("rtapi");
    const created = await request.post("/api/v1/links", {
      headers: auth,
      data: { url: SITE, code, routingRules: [{ platform: "ios", countries: ["us", "ca"], url: APP_STORE }] },
    });
    expect(created.status()).toBe(201);
    const link = (await created.json()) as { id: string; routingRules: unknown };
    expect(link.routingRules).toEqual([{ platform: "ios", countries: ["US", "CA"], url: APP_STORE }]);

    const updated = await request.patch(`/api/v1/links/${link.id}`, {
      headers: auth,
      data: { routingRules: [{ platform: "android", url: PLAY }] },
    });
    expect(((await updated.json()) as { routingRules: unknown }).routingRules).toEqual([
      { platform: "android", url: PLAY },
    ]);

    const untouched = await request.patch(`/api/v1/links/${link.id}`, {
      headers: auth,
      data: { title: "Renamed" },
    });
    expect(((await untouched.json()) as { routingRules: unknown[] }).routingRules).toHaveLength(1);

    for (const routingRules of [
      [{ url: PLAY }],
      [{ platform: "windows", url: PLAY }],
      [{ platform: "ios", url: "javascript:alert(1)" }],
      [
        { platform: "ios", url: APP_STORE },
        { platform: "ios", url: PLAY },
      ],
    ]) {
      const bad = await request.patch(`/api/v1/links/${link.id}`, { headers: auth, data: { routingRules } });
      expect(bad.status(), JSON.stringify(routingRules)).toBe(400);
    }

    const cleared = await request.patch(`/api/v1/links/${link.id}`, {
      headers: auth,
      data: { routingRules: [] },
    });
    expect(((await cleared.json()) as { routingRules: unknown[] }).routingRules).toEqual([]);
  });
});
