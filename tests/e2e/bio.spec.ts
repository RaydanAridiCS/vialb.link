import { expect, test, type Page } from "@playwright/test";
import { withDb } from "./db";
import { BROWSER_UA } from "./helpers";

let counter = 0;
/** A handle nobody else in this run uses. */
function uniqueHandle() {
  counter += 1;
  return `bio${Date.now().toString(36)}${counter}`;
}

async function createPage(page: Page, handle: string, options: { publish?: boolean; name?: string } = {}) {
  await page.goto("/dashboard/bio");
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Name", { exact: true }).fill(options.name ?? "Alice Example");
  await page.getByLabel("Bio", { exact: true }).fill("Maker of small things");
  if (options.publish ?? true) await page.getByRole("switch", { name: "Published" }).click();
  await page.getByTestId("bio-save").click();
  await expect(page.getByText(/Page saved/)).toBeVisible();
}

async function addButton(page: Page, label: string, url: string) {
  await page.getByLabel("Button label").fill(label);
  await page.getByLabel("Button link").fill(url);
  await page.getByTestId("bio-add-button").click();
  await expect(page.getByTestId("bio-buttons").getByText(label, { exact: true })).toBeVisible();
}

test.describe("link-in-bio", () => {
  test.beforeEach(async () => {
    // One page per user, and the e2e admin runs every test here.
    await withDb((sql) => sql`delete from links where kind = 'bio_button'`);
    await withDb((sql) => sql`delete from bio_profiles`);
  });

  test("build a page, publish it, and visitors can use it", async ({ page, browser }) => {
    const handle = uniqueHandle();
    await page.goto("/dashboard/bio");
    await expect(page.getByText("Create your page first")).toBeVisible();

    await createPage(page, handle);
    await page.getByText("Forest", { exact: true }).click();
    await page.getByRole("button", { name: "Add a social link" }).click();
    await page.getByLabel("Link 1", { exact: true }).fill("@alice");
    await expect(page.getByTestId("bio-preview")).toContainText("Alice Example");
    await page.getByTestId("bio-save").click();
    await expect(page.getByText(/Page saved/)).toBeVisible();

    await addButton(page, "My shop", "https://example.com/shop");
    await addButton(page, "My blog", "https://example.com/blog");
    await expect(page.getByTestId("bio-preview")).toContainText("My shop");

    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const v = await visitor.newPage();
    await v.route("https://example.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Shop</h1>" }),
    );
    await v.goto(`/@${handle}`);
    await expect(v.getByRole("heading", { level: 1, name: "Alice Example" })).toBeVisible();
    await expect(v.getByText("Maker of small things")).toBeVisible();
    await expect(v.getByRole("link", { name: "Instagram" })).toHaveAttribute(
      "href",
      "https://instagram.com/alice",
    );
    await expect(v.getByRole("link", { name: "Powered by Vialb" })).toBeVisible();
    const buttons = v.getByTestId("bio-page").getByRole("link", { name: /^My / });
    await expect(buttons).toHaveText(["My shop", "My blog"]);

    await buttons.first().click();
    await expect(v).toHaveURL("https://example.com/shop");
    await visitor.close();

    // The click is recorded after the response, so poll the editor.
    await expect(async () => {
      await page.goto("/dashboard/bio");
      await expect(page.getByTestId("bio-buttons").getByRole("listitem").first()).toContainText("1 clicks", {
        timeout: 1000,
      });
    }).toPass({ timeout: 15_000 });
  });

  test("the public page is only there while published, and handles are case-insensitive", async ({
    page,
    request,
  }) => {
    const handle = uniqueHandle();
    await createPage(page, handle, { publish: false });

    expect((await request.get(`/@${handle}`)).status()).toBe(404);

    await page.getByRole("switch", { name: "Published" }).click();
    await page.getByTestId("bio-save").click();
    await expect(page.getByText("Page saved and live")).toBeVisible();
    expect((await request.get(`/@${handle}`)).status()).toBe(200);

    const upper = await request.get(`/@${handle.toUpperCase()}`, { maxRedirects: 0 });
    expect(upper.status()).toBe(308);
    expect(upper.headers()["location"]).toContain(`/@${handle}`);

    const internal = await request.get(`/u/${handle}`, { maxRedirects: 0 });
    expect(internal.status()).toBe(308);
    expect(new URL(internal.headers()["location"] ?? "", "http://localhost").pathname).toBe(`/@${handle}`);

    // A short link that merely starts with "u" is not mistaken for a bio page.
    expect((await request.get("/ualice-nope", { maxRedirects: 0 })).status()).toBe(404);
  });

  test("refuses reserved handles and explains why", async ({ page }) => {
    await page.goto("/dashboard/bio");
    await page.getByLabel("Handle").fill("admin");
    await page.getByTestId("bio-save").click();
    await expect(page.getByText("This handle is reserved, please choose another")).toBeVisible();

    await page.getByLabel("Handle").fill("ab");
    await page.getByTestId("bio-save").click();
    await expect(page.getByText(/3-30 characters/)).toBeVisible();
  });

  test("shows whether a handle is free before saving", async ({ page }) => {
    const taken = uniqueHandle();
    await withDb(async (sql) => {
      const [user] = await sql<{ id: string }[]>`select id from "user" limit 1`;
      // A second account owns the handle.
      await sql`insert into "user" (id, name, email, email_verified) values ('other-bio-user', 'Other', 'other-bio@example.com', true) on conflict do nothing`;
      await sql`insert into bio_profiles (user_id, handle) values ('other-bio-user', ${taken}) on conflict do nothing`;
      return user;
    });
    await page.goto("/dashboard/bio");
    await page.getByLabel("Handle").fill(taken);
    await page.getByLabel("Handle").blur();
    await expect(page.getByTestId("handle-status")).toHaveText("This handle is taken");

    await page.getByLabel("Handle").fill(uniqueHandle());
    await page.getByLabel("Handle").blur();
    await expect(page.getByTestId("handle-status")).toHaveText("Available");
    await withDb((sql) => sql`delete from "user" where id = 'other-bio-user'`);
  });

  test("buttons can be reordered, hidden, edited and removed", async ({ page, request }) => {
    const handle = uniqueHandle();
    await createPage(page, handle);
    await addButton(page, "One", "https://example.com/1");
    await addButton(page, "Two", "https://example.com/2");
    await addButton(page, "Three", "https://example.com/3");

    const labels = () => page.getByTestId("bio-buttons").getByRole("listitem").locator("p.font-medium");
    await expect(labels()).toHaveText(["One", "Two", "Three"]);

    await page.getByRole("button", { name: "Move Three up" }).click();
    await expect(labels()).toHaveText(["One", "Three", "Two"]);
    await page.reload();
    await expect(labels()).toHaveText(["One", "Three", "Two"]);

    await page.getByRole("button", { name: "Hide One" }).click();
    await expect(page.getByRole("button", { name: "Show One" })).toBeVisible();

    await page.getByRole("button", { name: "Edit Two" }).click();
    await page.getByLabel("Label for Two").fill("Second");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(labels()).toHaveText(["One", "Three", "Second"]);

    const publicHtml = await (await request.get(`/@${handle}`)).text();
    expect(publicHtml).toContain("Three");
    expect(publicHtml).toContain("Second");
    expect(publicHtml).not.toContain(">One<");

    await page.getByRole("button", { name: "Remove Three" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await expect(labels()).toHaveText(["One", "Second"]);
  });

  test("a button to a blocked or invalid destination is refused with a message", async ({ page }) => {
    await createPage(page, uniqueHandle());
    await page.getByLabel("Button label").fill("Bad");
    await page.getByLabel("Button link").fill("javascript:alert(1)");
    await page.getByTestId("bio-add-button").click();
    await expect(page.getByRole("alert").filter({ hasText: /valid http/ })).toBeVisible();
    await expect(page.getByTestId("bio-buttons")).toHaveCount(0);
  });

  test("bio buttons stay out of the links list but their links still redirect", async ({ page, request }) => {
    const handle = uniqueHandle();
    await createPage(page, handle);
    await addButton(page, "Hidden link", "https://example.com/hidden-bio-link");

    await page.goto("/dashboard/links");
    await expect(page.getByText("hidden-bio-link")).toHaveCount(0);

    const html = await (await request.get(`/@${handle}`)).text();
    const code = /href="\/([^"]+)" rel="nofollow"/.exec(html)?.[1];
    expect(code).toBeTruthy();
    const redirect = await request.get(`/${code}`, {
      maxRedirects: 0,
      headers: { "user-agent": BROWSER_UA },
    });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()["location"]).toBe("https://example.com/hidden-bio-link");
  });

  test("deleting the page removes it, its links, and frees the handle", async ({ page, request }) => {
    const handle = uniqueHandle();
    await createPage(page, handle);
    await addButton(page, "Bye", "https://example.com/bye");
    const html = await (await request.get(`/@${handle}`)).text();
    const code = /href="\/([^"]+)" rel="nofollow"/.exec(html)?.[1];

    await page.getByRole("button", { name: "Delete page" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Create your page first")).toBeVisible();

    expect((await request.get(`/@${handle}`)).status()).toBe(404);
    expect(
      (await request.get(`/${code}`, { maxRedirects: 0, headers: { "user-agent": BROWSER_UA } })).status(),
    ).toBe(404);
    await createPage(page, handle);
  });
});
