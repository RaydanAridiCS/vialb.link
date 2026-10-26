import { expect, test, type Page } from "@playwright/test";
import { uniqueCode } from "./helpers";

let tagCounter = 0;
/** A tag nobody else in this run uses, so row counts stay deterministic. */
function uniqueTag() {
  tagCounter += 1;
  return `e2e${Date.now().toString(36)}${tagCounter}`;
}

async function addTags(page: Page, ...tags: string[]) {
  const input = page.getByLabel("Tags (optional)");
  for (const tag of tags) {
    await input.fill(tag);
    await input.press("Enter");
  }
}

async function createTaggedLink(page: Page, options: { url: string; tags: string[]; code?: string }) {
  const code = options.code ?? uniqueCode();
  await page.goto("/dashboard/links/new");
  await page.getByLabel("Long URL").fill(options.url);
  await page.getByLabel("Custom code (optional)").fill(code);
  await addTags(page, ...options.tags);
  await page.getByTestId("link-submit").click();
  await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);
  return { code, id: page.url().split("/").at(-1) ?? "" };
}

test.describe("link organization: tags and UTM", () => {
  test("a UTM-built destination is stored and used by the redirect", async ({ page, request }) => {
    const code = uniqueCode("utm");
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill("https://example.com/landing?ref=1");
    await page.getByLabel("Custom code (optional)").fill(code);

    await page.getByText("Campaign tracking (UTM)").click();
    await page.getByRole("button", { name: "Instagram bio" }).click();
    await page.getByLabel("Campaign").fill("spring-sale");
    await expect(page.getByTestId("utm-preview")).toContainText("utm_campaign=spring-sale");
    await page.getByRole("button", { name: "Apply to long URL" }).click();

    await expect(page.getByLabel("Long URL")).toHaveValue(
      "https://example.com/landing?ref=1&utm_source=instagram&utm_medium=social_bio&utm_campaign=spring-sale",
    );
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);

    const response = await request.get(`/${code}`, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const location = new URL(response.headers()["location"] ?? "");
    expect(location.searchParams.get("ref")).toBe("1");
    expect(location.searchParams.get("utm_source")).toBe("instagram");
    expect(location.searchParams.get("utm_medium")).toBe("social_bio");
    expect(location.searchParams.get("utm_campaign")).toBe("spring-sale");
  });

  test("the tag input explains an invalid tag instead of silently dropping it", async ({ page }) => {
    await page.goto("/dashboard/links/new");
    const input = page.getByLabel("Tags (optional)");

    await input.fill("bad;tag");
    await input.press("Enter");

    await expect(page.getByRole("alert").filter({ hasText: "letters, numbers" })).toBeVisible();
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveValue("bad;tag");

    await input.fill("good-tag");
    await expect(page.getByRole("alert").filter({ hasText: "letters, numbers" })).toHaveCount(0);
    await input.press("Enter");
    await expect(page.getByRole("button", { name: "Remove tag good-tag" })).toBeVisible();
  });

  test("tag chips can be removed with the mouse", async ({ page }) => {
    await page.goto("/dashboard/links/new");
    await addTags(page, "one", "two");

    await page.getByRole("button", { name: "Remove tag one" }).click();

    await expect(page.getByRole("button", { name: "Remove tag one" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove tag two" })).toBeVisible();
  });

  test("tag pills and dropdown filter the table, the filter survives a reload, and it can be cleared", async ({
    page,
  }) => {
    const tag = uniqueTag();
    const other = uniqueTag();
    const a = await createTaggedLink(page, { url: "https://example.com/a", tags: [tag, other] });
    const b = await createTaggedLink(page, { url: "https://example.com/b", tags: [tag] });
    const c = await createTaggedLink(page, { url: "https://example.com/c", tags: [other] });

    await page.goto("/dashboard/links");
    const row = (code: string) => page.getByTestId("link-row").filter({ hasText: `/${code}` });
    await expect(row(a.code)).toBeVisible();
    await expect(row(b.code)).toBeVisible();
    await expect(row(c.code)).toBeVisible();

    // Clicking a pill filters by that tag.
    await row(b.code)
      .getByRole("button", { name: `Filter by tag ${tag}` })
      .click();
    await expect(page).toHaveURL(new RegExp(`tag=${tag}`));
    await expect(row(a.code)).toBeVisible();
    await expect(row(b.code)).toBeVisible();
    await expect(row(c.code)).toHaveCount(0);

    // The filter is in the URL, so a reload keeps it.
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`tag=${tag}`));
    await expect(row(c.code)).toHaveCount(0);
    await expect(row(a.code)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Filter by tag" })).toContainText(tag);

    // The dropdown switches to another tag...
    await page.getByRole("combobox", { name: "Filter by tag" }).click();
    await page.getByRole("option", { name: other, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`tag=${other}`));
    await expect(row(b.code)).toHaveCount(0);
    await expect(row(c.code)).toBeVisible();

    // ...and "All tags" clears it.
    await page.getByRole("combobox", { name: "Filter by tag" }).click();
    await page.getByRole("option", { name: "All tags" }).click();
    await expect(page).not.toHaveURL(/tag=/);
    await expect(row(b.code)).toBeVisible();

    // Clicking the active pill a second time also clears the filter.
    await row(a.code)
      .getByRole("button", { name: `Filter by tag ${tag}` })
      .click();
    await expect(page).toHaveURL(new RegExp(`tag=${tag}`));
    await page
      .getByRole("button", { name: `Filter by tag ${tag}`, pressed: true })
      .first()
      .click();
    await expect(page).not.toHaveURL(/tag=/);
  });

  test("editing a link replaces its tags", async ({ page }) => {
    const first = uniqueTag();
    const second = uniqueTag();
    const { id, code } = await createTaggedLink(page, { url: "https://example.com/edit", tags: [first] });

    await page.goto(`/dashboard/links/${id}/edit`);
    await expect(page.getByRole("button", { name: `Remove tag ${first}` })).toBeVisible();
    await page.getByRole("button", { name: `Remove tag ${first}` }).click();
    await addTags(page, second);
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);

    await page.goto(`/dashboard/links?tag=${second}`);
    await expect(page.getByTestId("link-row").filter({ hasText: `/${code}` })).toBeVisible();
    await page.goto(`/dashboard/links?tag=${first}`);
    await expect(page.getByTestId("link-row")).toHaveCount(0);
    await expect(page.getByText("No links match these filters.")).toBeVisible();
  });

  test("the admin links view filters by tag too", async ({ page }) => {
    const tag = uniqueTag();
    const { code } = await createTaggedLink(page, { url: "https://example.com/admin", tags: [tag] });
    const untagged = await createTaggedLink(page, { url: "https://example.com/admin2", tags: [] });

    await page.goto(`/admin/links?tag=${tag}`);

    await expect(page.getByTestId("link-row").filter({ hasText: `/${code}` })).toBeVisible();
    await expect(page.getByTestId("link-row").filter({ hasText: `/${untagged.code}` })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Filter by tag" })).toContainText(tag);
  });
});
