import { expect, test, type Page } from "@playwright/test";
import { withDb } from "./db";
import { BROWSER_UA, createLinkViaForm, uniqueCode } from "./helpers";

/** Waits until the analytics page shows at least `n` clicks (clicks are recorded after the redirect responds). */
async function waitForClicks(page: Page, id: string, n: number, query = "") {
  await expect(async () => {
    await page.goto(`/dashboard/links/${id}${query}`);
    const text = await page.getByTestId("analytics-kpis").innerText();
    expect(Number(/Total clicks\s+(\d+)/.exec(text)?.[1] ?? 0)).toBeGreaterThanOrEqual(n);
  }).toPass({ timeout: 20_000 });
}

test.describe("period comparison", () => {
  test("rows show how they changed, and the switch turns that off and on", async ({ page, request }) => {
    const { id, code } = await createLinkViaForm(page, {
      url: "https://example.com/cmp",
      code: uniqueCode("cmp"),
    });
    const visit = await request.get(`/${code}`, {
      maxRedirects: 0,
      headers: {
        "user-agent": BROWSER_UA,
        "x-forwarded-for": "198.51.100.77",
        referer: "https://news.example/a",
      },
    });
    expect(visit.status()).toBe(302);
    await waitForClicks(page, id, 1);

    const sources = page.locator("section", { hasText: "Traffic sources" }).first();
    await expect(sources.getByTestId("row-change").first()).toHaveText("new");

    const toggle = page.getByRole("switch", { name: "Compare to previous period" });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(page).toHaveURL(/compare=0/);
    await expect(page.getByTestId("row-change")).toHaveCount(0);
    await page.getByRole("switch", { name: "Compare to previous period" }).click();
    await expect(page).not.toHaveURL(/compare=0/);
    await expect(page.getByTestId("row-change").first()).toBeVisible();
  });

  test("the unique-visitor card says what it counts", async ({ page }) => {
    const { id } = await createLinkViaForm(page, { url: "https://example.com/uq", code: uniqueCode("uq") });
    await page.goto(`/dashboard/links/${id}`);
    await expect(page.getByTestId("analytics-kpis")).toContainText("Unique visitors (per day)");
    await expect(page.getByTestId("analytics-kpis")).toContainText(
      "someone back on another day counts again",
    );
  });
});

test.describe("conversions", () => {
  test("a postback is counted once, shows up in analytics, and abuse is refused", async ({
    page,
    request,
  }) => {
    const { id, code } = await createLinkViaForm(page, {
      url: "https://example.com/shop?x=1",
      code: uniqueCode("conv"),
    });

    // Off by default: no id is added.
    const plain = await request.get(`/${code}`, { maxRedirects: 0, headers: { "user-agent": BROWSER_UA } });
    expect(new URL(plain.headers()["location"] ?? "").searchParams.has("vclid")).toBe(false);

    // Turn it on from the edit page, which says what it does first.
    await page.goto(`/dashboard/links/${id}/edit`);
    const card = page.getByTestId("conversions-card");
    await expect(card).toContainText("destination and anything that logs its URLs will see it");
    await card.getByRole("switch").click();
    await expect(card.getByRole("textbox", { name: "Copy script tag" })).toHaveValue(
      /\/api\/convert\/snippet\.js/,
    );
    await expect(card.getByRole("textbox", { name: "Copy postback URL" })).toHaveValue(/cid=\{vclid\}/);

    // Each visit gets a different random id on the destination.
    const ids: string[] = [];
    for (const ip of ["198.51.100.1", "198.51.100.2", "198.51.100.3"]) {
      const response = await request.get(`/${code}`, {
        maxRedirects: 0,
        headers: { "user-agent": BROWSER_UA, "x-forwarded-for": ip },
      });
      expect(response.status()).toBe(302);
      const location = new URL(response.headers()["location"] ?? "");
      expect(location.searchParams.get("x")).toBe("1");
      ids.push(location.searchParams.get("vclid") ?? "");
    }
    for (const value of ids) expect(value).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(new Set(ids).size).toBe(3);

    await waitForClicks(page, id, 3);

    // A form-style postback with an amount, then a repeat of it.
    const first = await request.post("/api/convert", {
      form: { cid: ids[0] ?? "", value: "49.90", currency: "usd" },
    });
    expect(first.status()).toBe(204);
    expect(first.headers()["access-control-allow-origin"]).toBe("*");
    expect((await request.get(`/api/convert?cid=${ids[0]}&value=1&currency=USD`)).status()).toBe(204);
    // A second click converts without a value, through a GET like an affiliate network would send.
    expect((await request.get(`/api/convert?cid=${ids[1]}`)).status()).toBe(204);

    // Bad input is a 400; unknown but well-formed ids look exactly like success.
    for (const query of [
      "cid=short",
      "cid=",
      "",
      `cid=${ids[2]}&value=-5&currency=USD`,
      `cid=${ids[2]}&value=5&currency=BTC`,
      `cid=${ids[2]}&value=5`,
    ]) {
      const bad = await request.get(`/api/convert?${query}`);
      expect(bad.status(), query).toBe(400);
      expect((await bad.json()).error.code).toBe("VALIDATION_ERROR");
    }
    expect((await request.get("/api/convert?cid=AAAAAAAAAAAAAAAA")).status()).toBe(204);
    const huge = await request.post("/api/convert", { data: { cid: ids[2], pad: "x".repeat(2000) } });
    expect(huge.status()).toBe(400);

    // Analytics: 2 conversions out of 3 tracked clicks, and only the first report's value counts.
    await page.goto(`/dashboard/links/${id}`);
    const panel = page.getByTestId("conversions-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("66.7%");
    await expect(panel.getByText("$49.90")).toBeVisible();
    await expect(panel).toContainText("Very recent clicks may not have had time to convert");

    // The stored conversions hold no personal data.
    const rows = await withDb((sql) => sql`select * from conversions where link_id = ${id}`);
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "click_id",
      "currency",
      "id",
      "link_id",
      "occurred_at",
      "value_minor",
    ]);
    expect(JSON.stringify(rows)).not.toContain("198.51.100");

    // The CSV export shows what converted but never the id.
    const csv = await (await page.request.get(`/api/app/links/${id}/clicks.csv`)).text();
    expect(csv).toContain("converted,conversion_value,conversion_currency");
    expect(csv).toMatch(/,true,49\.9,USD/);
    for (const value of ids) expect(csv).not.toContain(value);
  });

  test("the snippet is served for any site to load, and preflights succeed", async ({ request }) => {
    const script = await request.get("/api/convert/snippet.js");
    expect(script.status()).toBe(200);
    expect(script.headers()["content-type"]).toContain("javascript");
    expect(script.headers()["access-control-allow-origin"]).toBe("*");
    const body = await script.text();
    expect(body).toContain("sessionStorage");
    expect(body).toContain("window.vialb.convert");
    expect(body).not.toMatch(/document\.cookie/);

    const preflight = await request.fetch("/api/convert", { method: "OPTIONS" });
    expect(preflight.status()).toBe(204);
    expect(preflight.headers()["access-control-allow-methods"]).toContain("POST");
  });

  test("the browser snippet reads the id from the landing URL and reports a conversion", async ({
    page,
    request,
  }) => {
    const { id, code } = await createLinkViaForm(page, {
      url: "https://example.com/snip",
      code: uniqueCode("snip"),
    });
    await page.goto(`/dashboard/links/${id}/edit`);
    await page.getByTestId("conversions-card").getByRole("switch").click();
    await expect(page.getByRole("textbox", { name: "Copy script tag" })).toBeVisible();

    const response = await request.get(`/${code}`, {
      maxRedirects: 0,
      headers: { "user-agent": BROWSER_UA, "x-forwarded-for": "198.51.100.50" },
    });
    const vclid = new URL(response.headers()["location"] ?? "").searchParams.get("vclid") ?? "";
    await waitForClicks(page, id, 1);

    // A stand-in destination page that loads the snippet, the way a customer's site would. It is served from this
    // origin because browsers block pages from other sites reaching localhost.
    const origin = new URL(page.url()).origin;
    const destination = await page.context().newPage();
    await destination.route(`${origin}/e2e-destination**`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Thanks</title><script src="${origin}/api/convert/snippet.js"></script><p>Thanks!</p>`,
      }),
    );
    await destination.goto(`${origin}/e2e-destination?vclid=${vclid}`);
    await destination.waitForFunction(
      () => typeof (window as unknown as { vialb?: unknown }).vialb === "object",
    );
    const sent = destination.waitForRequest(
      (req) => req.url().includes("/api/convert") && req.method() === "POST",
    );
    expect(
      await destination.evaluate(() =>
        (window as unknown as { vialb: { convert: (o: object) => boolean } }).vialb.convert({
          value: 20,
          currency: "EUR",
        }),
      ),
    ).toBe(true);
    await sent;
    await destination.close();

    await expect(async () => {
      const rows = await withDb(
        (sql) => sql`select value_minor, currency from conversions where link_id = ${id}`,
      );
      expect(rows).toEqual([{ value_minor: "2000", currency: "EUR" }]);
    }).toPass({ timeout: 15_000 });
  });
});

test.describe("click retention", () => {
  test("the admin sees what a period would delete, saves it, and the job removes only older clicks", async ({
    page,
  }) => {
    const { id } = await createLinkViaForm(page, { url: "https://example.com/ret", code: uniqueCode("ret") });
    await withDb(async (sql) => {
      const columns = `link_id, visitor_hash, occurred_at`;
      await sql.unsafe(
        `insert into clicks (${columns}) values ($1, 'old', now() - interval '400 days'), ($1, 'old2', now() - interval '200 days'), ($1, 'fresh', now() - interval '2 days')`,
        [id],
      );
    });

    try {
      await page.goto("/admin");
      await page.getByLabel("Keep click data for (days)").fill("90");
      await expect(page.getByTestId("retention-note")).toContainText(
        /\d+ of \d+ stored clicks are older than this/,
      );
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Instance settings saved")).toBeVisible();

      await page.reload();
      await page.getByRole("button", { name: "Run Data retention now" }).click();
      await expect(page.getByText("Job ran")).toBeVisible();
      await expect(page.getByTestId("job-retention")).toContainText(/deleted \d+ clicks older than 90 days/);

      const left = await withDb(
        (sql) => sql`select visitor_hash from clicks where link_id = ${id} order by visitor_hash`,
      );
      expect(left.map((r) => r["visitor_hash"])).toEqual(["fresh"]);
    } finally {
      await page.goto("/admin");
      await page.getByLabel("Keep click data for (days)").fill("");
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Instance settings saved")).toBeVisible();
    }
  });
});
