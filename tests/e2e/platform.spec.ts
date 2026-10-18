import { expect, test } from "@playwright/test";

test.describe("platform", () => {
  test("anonymous creation can be toggled by the admin", async ({ page, browser }) => {
    const setAnonymous = async (value: "On" | "Off") => {
      await page.goto("/admin");
      await page.getByRole("combobox", { name: "Anonymous link creation" }).click();
      await page.getByRole("option", { name: value, exact: true }).click();
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Instance settings saved")).toBeVisible();
    };

    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const v = await visitor.newPage();

    await setAnonymous("Off");
    await v.goto("/");
    await expect(v.getByRole("link", { name: "Sign up to shorten" })).toBeVisible();

    await setAnonymous("On");
    // Settings are cached for a few seconds per process.
    await expect(async () => {
      await v.goto("/");
      await expect(v.getByRole("button", { name: "Shorten" })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    await v.getByLabel("Paste a long URL").fill("https://example.com/anonymous");
    await v.getByRole("button", { name: "Shorten" }).click();
    await expect(v.getByTestId("quick-result")).toBeVisible();
    await expect(v.getByTestId("quick-short-url")).toContainText("localhost");
    await expect(v.getByText(/anonymous link expires/)).toBeVisible();
    await visitor.close();
    await setAnonymous("Off");
  });

  test("API key: create in UI, then call the REST API", async ({ page, request }) => {
    await page.goto("/dashboard/api-keys");
    await page.getByLabel("Name").fill("E2E key");
    await page.getByRole("button", { name: "Create key" }).click();
    const secret = (await page.getByTestId("api-key-secret").textContent())?.trim() ?? "";
    expect(secret).toMatch(/^tw_/);

    const auth = { Authorization: `Bearer ${secret}` };
    const created = await request.post("/api/v1/links", {
      headers: { ...auth, "Content-Type": "application/json" },
      data: { url: "https://example.com/from-api", title: "From the API" },
    });
    expect(created.status()).toBe(201);
    expect(created.headers()["x-ratelimit-limit"]).toBeDefined();
    const link = (await created.json()) as { id: string; code: string; shortUrl: string };

    const list = await request.get("/api/v1/links?limit=5", { headers: auth });
    expect(list.status()).toBe(200);
    const body = (await list.json()) as { data: { id: string }[] };
    expect(body.data.map((l) => l.id)).toContain(link.id);

    const conflict = await request.post("/api/v1/links", {
      headers: { ...auth, "Content-Type": "application/json" },
      data: { url: "https://example.com", code: link.code },
    });
    expect(conflict.status()).toBe(409);
    expect(((await conflict.json()) as { error: { code: string } }).error.code).toBe("CONFLICT");

    const bad = await request.post("/api/v1/links", {
      headers: { ...auth, "Content-Type": "application/json" },
      data: { url: "javascript:alert(1)" },
    });
    expect(bad.status()).toBe(400);

    const qr = await request.get(`/api/v1/links/${link.id}/qr.svg`, { headers: auth });
    expect(qr.headers()["content-type"]).toContain("image/svg+xml");

    expect(
      (await request.get("/api/v1/links", { headers: { Authorization: "Bearer tw_nope" } })).status(),
    ).toBe(401);
  });

  test("dark mode toggle", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("theme-toggle").click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("menu")).toBeHidden();
    await page.getByTestId("theme-toggle").click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("security headers and health endpoint", async ({ request }) => {
    const home = await request.get("/");
    const csp = home.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src 'self' 'nonce-/);
    expect(home.headers()["x-content-type-options"]).toBe("nosniff");
    const health = await request.get("/api/health");
    expect(await health.json()).toMatchObject({ status: "ok", database: "ok" });
  });
});
