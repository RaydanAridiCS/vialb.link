import { expect, test } from "@playwright/test";
import { BROWSER_UA, createLinkViaForm, uniqueCode } from "./helpers";

test.describe("public stats page", () => {
  test("opt-in, aggregate-only, not indexable, and revocable", async ({ page, browser, request }) => {
    const { id, code } = await createLinkViaForm(page, {
      url: "https://example.com/secret-destination",
      code: uniqueCode("pub"),
    });

    // A few visits from different "visitors", so there is something to count.
    for (const ip of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) {
      const response = await request.get(`/${code}`, {
        maxRedirects: 0,
        headers: {
          "user-agent": BROWSER_UA,
          "x-forwarded-for": ip,
          referer: "https://news.example/story?private=1",
        },
      });
      expect(response.status()).toBe(302);
    }

    // Off by default: nothing at the obvious addresses.
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const guest = await visitor.newPage();
    expect((await guest.goto(`/stats/${code}`))?.status()).toBe(404);

    // The owner turns it on and copies the address.
    await page.goto(`/dashboard/links/${id}/edit`);
    const card = page.getByTestId("public-stats-card");
    await expect(card.getByLabel("Public stats address")).toHaveCount(0);
    await card.getByRole("switch").click();
    const address = card.getByLabel("Public stats address");
    await expect(address).toBeVisible();
    const url = await address.inputValue();
    expect(url).toMatch(/\/stats\/[A-Za-z0-9_-]{22}$/);
    expect(url).not.toContain(code);

    // Anyone with the address, signed out, sees totals but nothing about people.
    const response = await guest.goto(url);
    expect(response?.status()).toBe(200);
    const headers = response?.headers() ?? {};
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
    await expect(guest.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    const view = guest.getByTestId("public-stats");
    await expect(async () => {
      await guest.reload();
      await expect(view.getByText("Clicks", { exact: true })).toBeVisible();
      await expect(view).toContainText("news.example");
    }).toPass({ timeout: 20_000 });
    await expect(view.getByRole("heading", { level: 1 })).toContainText(`/${code}`);
    for (const forbidden of [
      "Recent clicks",
      "secret-destination",
      "198.51.100",
      "private=1",
      "Smart routing",
    ]) {
      await expect(guest.locator("body")).not.toContainText(forbidden);
    }

    // Rotating the address kills the old one at once.
    await page.reload();
    await page.getByRole("button", { name: /generate a new address/i }).click();
    await expect(async () => {
      expect(await card.getByLabel("Public stats address").inputValue()).not.toBe(url);
    }).toPass();
    expect((await guest.goto(url))?.status()).toBe(404);
    const rotated = await card.getByLabel("Public stats address").inputValue();
    expect((await guest.goto(rotated))?.status()).toBe(200);

    // Turning it off revokes it.
    await card.getByRole("switch").click();
    await expect(card.getByLabel("Public stats address")).toHaveCount(0);
    expect((await guest.goto(rotated))?.status()).toBe(404);
    await visitor.close();
  });

  test("the REST API can switch it too", async ({ page, request }) => {
    const { id } = await createLinkViaForm(page, {
      url: "https://example.com/api-stats",
      code: uniqueCode("pubapi"),
    });
    await page.goto("/dashboard/api-keys");
    await page.getByLabel("Name").fill("Stats key");
    await page.getByRole("button", { name: "Create key" }).click();
    const secret = (await page.getByTestId("api-key-secret").textContent())?.trim() ?? "";
    const auth = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

    const on = await request.patch(`/api/v1/links/${id}`, { headers: auth, data: { publicStats: true } });
    expect(on.status()).toBe(200);
    const link = await on.json();
    expect(link.statsUrl).toMatch(/\/stats\//);
    const off = await request.patch(`/api/v1/links/${id}`, { headers: auth, data: { publicStats: false } });
    expect((await off.json()).statsUrl).toBeNull();
  });
});
