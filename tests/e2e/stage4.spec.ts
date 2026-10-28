import { expect, test, type Page } from "@playwright/test";
import { withDb } from "./db";
import { BROWSER_UA, createLinkViaForm, uniqueCode } from "./helpers";

async function apiKey(page: Page, name: string) {
  await page.goto("/dashboard/api-keys");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create key" }).click();
  const secret = (await page.getByTestId("api-key-secret").textContent())?.trim() ?? "";
  return { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
}

test.describe("410 for gone links", () => {
  test("expired, disabled and out-of-visits links answer 410 with the explanation, on GET and HEAD", async ({
    page,
    request,
  }) => {
    const expired = await createLinkViaForm(page, { url: "https://example.com/old", code: uniqueCode("gx") });
    await withDb(
      (sql) => sql`update links set expires_at = now() - interval '1 minute' where id = ${expired.id}`,
    );
    const disabled = await createLinkViaForm(page, {
      url: "https://example.com/off",
      code: uniqueCode("gd"),
    });
    await withDb((sql) => sql`update links set is_enabled = false where id = ${disabled.id}`);
    const limited = await createLinkViaForm(page, {
      url: "https://example.com/once",
      code: uniqueCode("gl"),
      accessLimit: "1 visit",
    });
    await request.get(`/${limited.code}`, { maxRedirects: 0, headers: { "user-agent": BROWSER_UA } });

    for (const [link, text, reason] of [
      [expired, "This link has expired", "expired"],
      [disabled, "This link has been disabled", "disabled"],
      [limited, "This link reached its visit limit", "limit"],
    ] as const) {
      const get = await request.get(`/${link.code}`, {
        maxRedirects: 0,
        headers: { "user-agent": BROWSER_UA },
      });
      expect(get.status(), link.code).toBe(410);
      expect(get.headers()["cache-control"]).toContain("no-store");
      expect(get.headers()["x-robots-tag"]).toContain("noindex");
      expect(get.headers()["content-security-policy"]).toContain("default-src 'none'");
      const body = await get.text();
      expect(body).toContain(text);
      expect(body).toContain(`data-reason="${reason}"`);
      expect(body).not.toMatch(/<script/i);
      expect((await request.head(`/${link.code}`, { maxRedirects: 0 })).status(), `HEAD ${link.code}`).toBe(
        410,
      );
    }

    // Crawlers (link previews, search engines) learn the link is gone too.
    const crawler = await request.get(`/${disabled.code}`, {
      maxRedirects: 0,
      headers: { "user-agent": "Googlebot/2.1" },
    });
    expect(crawler.status()).toBe(410);

    // Unknown codes and deleted links stay 404; the old /gone address is a 410 as well.
    expect((await request.get("/not-a-real-code-zz", { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.head("/not-a-real-code-zz", { maxRedirects: 0 })).status()).toBe(404);
    expect((await request.get(`/gone/${expired.code}?reason=limit`, { maxRedirects: 0 })).status()).toBe(410);
    expect(await (await request.get("/gone/x?reason=nonsense")).text()).toContain(
      "This link has been disabled",
    );

    // An active link still redirects and answers HEAD 200.
    const live = await createLinkViaForm(page, { url: "https://example.com/live", code: uniqueCode("gok") });
    expect(
      (
        await request.get(`/${live.code}`, { maxRedirects: 0, headers: { "user-agent": BROWSER_UA } })
      ).status(),
    ).toBe(302);
    expect((await request.head(`/${live.code}`, { maxRedirects: 0 })).status()).toBe(200);
  });

  test("a visitor in a browser sees the page (and the dashboard link keeps working)", async ({ page }) => {
    const { id, code } = await createLinkViaForm(page, {
      url: "https://example.com/browser",
      code: uniqueCode("gb"),
    });
    await withDb((sql) => sql`update links set is_enabled = false where id = ${id}`);
    const response = await page.goto(`/${code}`);
    expect(response?.status()).toBe(410);
    await expect(page.getByRole("heading", { name: "This link has been disabled" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Go to/ })).toBeVisible();
  });
});

test.describe("preview before redirect", () => {
  test("shows the destination and a Continue button, counts the visit, and leaves crawlers alone", async ({
    page,
    request,
  }) => {
    const { id, code } = await createLinkViaForm(page, {
      url: "https://example.com/preview-target?a=1&b=2",
      code: uniqueCode("pv"),
    });
    await page.goto(`/dashboard/links/${id}/edit`);
    await page.getByTestId("preview-page-card").getByRole("switch").click();
    await expect(page.getByTestId("preview-page-card").getByRole("switch")).toBeChecked();

    // Plain request: a normal page, not a redirect.
    const response = await request.get(`/${code}`, {
      maxRedirects: 0,
      headers: { "user-agent": BROWSER_UA },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
    expect(await response.text()).not.toMatch(/<script|http-equiv=.refresh/i);

    const visitor = await page.context().newPage();
    await visitor.goto(`/${code}`);
    await expect(visitor.getByTestId("interstitial-host")).toHaveText("example.com");
    await expect(visitor.getByTestId("interstitial-url")).toHaveText(
      "https://example.com/preview-target?a=1&b=2",
    );
    await expect(visitor.getByTestId("interstitial-continue")).toHaveAttribute(
      "href",
      "https://example.com/preview-target?a=1&b=2",
    );
    await expect(visitor).toHaveURL(new RegExp(`/${code}$`)); // it did not navigate away by itself
    await visitor.close();

    // Link-preview bots still get the normal preview card page, not the interstitial.
    const bot = await request.get(`/${code}`, {
      maxRedirects: 0,
      headers: { "user-agent": "Twitterbot/1.0" },
    });
    expect(bot.status()).toBe(200);
    expect(await bot.text()).not.toContain("You are about to leave");

    // The visits were counted when the preview was shown.
    await expect(async () => {
      await page.goto(`/dashboard/links/${id}`);
      const text = await page.getByTestId("analytics-kpis").innerText();
      expect(Number(/Total clicks\s+(\d+)/.exec(text)?.[1] ?? 0)).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 20_000 });

    // Switching it off restores the plain redirect.
    await page.goto(`/dashboard/links/${id}/edit`);
    await page.getByTestId("preview-page-card").getByRole("switch").click();
    await expect(page.getByTestId("preview-page-card").getByRole("switch")).not.toBeChecked();
    const off = await request.get(`/${code}`, { maxRedirects: 0, headers: { "user-agent": BROWSER_UA } });
    expect(off.status()).toBe(302);
  });

  test("cannot be combined with retargeting pixels", async ({ page, request }) => {
    const auth = await apiKey(page, "Preview key");
    const created = await request.post("/api/v1/links", {
      headers: auth,
      data: { url: "https://example.com/px", code: uniqueCode("pvpx"), pixels: { meta: "123456789012345" } },
    });
    const link = await created.json();
    const refused = await request.patch(`/api/v1/links/${link.id}`, {
      headers: auth,
      data: { previewInterstitial: true },
    });
    expect(refused.status()).toBe(400);
    expect(JSON.stringify(await refused.json())).toContain("pixels");
    const ok = await request.patch(`/api/v1/links/${link.id}`, {
      headers: auth,
      data: { previewInterstitial: true, pixels: null },
    });
    expect((await ok.json()).previewInterstitial).toBe(true);
  });
});

test.describe("instance branding", () => {
  test.afterEach(async ({ page }) => {
    await page.goto("/admin");
    for (const id of [
      "brand-name",
      "brand-accent",
      "brand-logo",
      "brand-404",
      "brand-gone",
      "brand-home-label",
      "brand-home-url",
    ]) {
      await page.locator(`#${id}`).fill("");
    }
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Instance settings saved")).toBeVisible();
  });

  test("brands the not-found and gone pages, previews live, and refuses unsafe values", async ({
    page,
    request,
  }) => {
    const { id, code } = await createLinkViaForm(page, {
      url: "https://example.com/brand",
      code: uniqueCode("br"),
    });
    await withDb((sql) => sql`update links set is_enabled = false where id = ${id}`);

    await page.goto("/admin");
    await page.locator("#brand-name").fill("Acme <b>Links</b>");
    await page.locator("#brand-accent").fill("#1A7F5A");
    await page.locator("#brand-404").fill("We could not find that one.");
    await page.locator("#brand-gone").fill("This campaign has ended.");
    await page.locator("#brand-home-label").fill("Visit Acme");
    await page.locator("#brand-home-url").fill("https://acme.example/");
    const preview = page.getByTestId("branding-preview");
    await expect(preview).toContainText("Acme <b>Links</b>");
    await expect(preview).toContainText("We could not find that one.");
    await expect(preview).toContainText("Visit Acme");

    // Unsafe values are explained, nothing is saved.
    await page.locator("#brand-accent").fill("#FFEE00");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/too light/)).toBeVisible();
    await page.locator("#brand-accent").fill("#1A7F5A");
    await page.locator("#brand-logo").fill("http://insecure.example/logo.png");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/https:\/\/ image address/)).toBeVisible();
    await page.locator("#brand-logo").fill("");
    await page.locator("#brand-home-url").fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText(/button link must be/)).toBeVisible();
    await page.locator("#brand-home-url").fill("https://acme.example/");

    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Instance settings saved")).toBeVisible();

    // Settings are cached for a few seconds per process.
    await expect(async () => {
      const notFound = await request.get("/no-such-code-here", { maxRedirects: 0 });
      expect(notFound.status()).toBe(404);
      const html = await notFound.text();
      expect(html).toContain("Acme &lt;b&gt;Links&lt;/b&gt;");
      expect(html).not.toContain("<b>Links</b>");
      expect(html).toContain("We could not find that one.");
      expect(html).toContain("--accent:#1A7F5A");
      expect(html).toContain('href="https://acme.example/">Visit Acme');
    }).toPass({ timeout: 15_000 });

    const gone = await request.get(`/${code}`, { maxRedirects: 0, headers: { "user-agent": BROWSER_UA } });
    expect(gone.status()).toBe(410);
    expect(await gone.text()).toContain("This campaign has ended.");

    // The application's own 404 follows it as well.
    await page.goto("/no/such/page/anywhere");
    await expect(page.getByTestId("not-found-page")).toContainText("We could not find that one.");
    await expect(page.getByRole("link", { name: "Visit Acme" })).toHaveAttribute(
      "href",
      "https://acme.example/",
    );
  });
});

test.describe("two-factor for administrators", () => {
  async function setRequired(value: boolean | null) {
    await withDb(
      (sql) => sql`insert into instance_settings (id, require_admin_2fa) values (1, ${value})
        on conflict (id) do update set require_admin_2fa = ${value}`,
    );
  }

  test.afterEach(async ({ page }) => {
    await setRequired(null);
    // The setting is cached for a few seconds per process.
    await expect(async () => {
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/admin$/);
    }).toPass({ timeout: 20_000 });
  });

  test("an administrator without it is sent to set it up, but keeps their dashboard", async ({ page }) => {
    await setRequired(true);
    await expect(async () => {
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/dashboard\/settings\?2fa=required/);
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId("two-factor-required")).toContainText("required for administrators");
    await expect(
      page.getByRole("button", { name: /Enable two-factor/i }).or(page.getByText(/two-factor/i).first()),
    ).toBeVisible();

    // Everything outside the admin area still works.
    await page.goto("/dashboard/links");
    await expect(page).toHaveURL(/\/dashboard\/links$/);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/dashboard\/settings\?2fa=required/);
  });

  test("the requirement cannot be switched on by an administrator who lacks it themselves", async ({
    page,
  }) => {
    await page.goto("/admin");
    await page.getByRole("combobox", { name: /Require two-factor for administrators/ }).click();
    await page.getByRole("option", { name: "On", exact: true }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(
      page.getByText(/Turn on two-factor authentication for your own account first/),
    ).toBeVisible();
    await page.goto("/admin");
    await expect(page.getByRole("combobox", { name: /Require two-factor for administrators/ })).toContainText(
      "Default (off)",
    );
  });
});
