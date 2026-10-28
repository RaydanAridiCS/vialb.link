import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { uniqueCode } from "./helpers";

/** Loads a fixture and swaps the placeholder for a prefix unique to this test run. */
function fixture(name: string, prefix: string) {
  const text = readFileSync(path.join(__dirname, "fixtures", name), "utf8").replaceAll("__P__", prefix);
  return { name, mimeType: "text/csv", buffer: Buffer.from(text) };
}

async function openImport(page: Page) {
  await page.goto("/dashboard/links");
  await page.getByRole("button", { name: "Import CSV" }).click();
  const dialog = page.getByRole("dialog", { name: "Import links from CSV" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("CSV import", () => {
  test("imports a Bitly-style file: preview, progress, summary, and the links work", async ({
    page,
    request,
  }) => {
    const prefix = uniqueCode("imp");
    const dialog = await openImport(page);

    await dialog.getByLabel("CSV file").setInputFiles(fixture("import-happy.csv", prefix));

    // Columns were detected from the header names (Long URL, Back-half, ...).
    await expect(dialog.getByLabel(/Destination URL/)).toHaveValue("0");
    await expect(dialog.getByLabel("Custom code")).toHaveValue("2");
    await expect(dialog.getByTestId("import-preview-row")).toHaveCount(3);
    await expect(dialog.getByTestId("import-summary-line")).toContainText("3 ready");

    await dialog.getByRole("button", { name: "Import 3 links" }).click();

    const summary = dialog.getByTestId("import-summary");
    await expect(summary).toBeVisible();
    await expect(summary.getByText("Created").locator("xpath=following-sibling::p")).toHaveText("3");
    await expect(summary.getByText("Failed").locator("xpath=following-sibling::p")).toHaveText("0");

    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();

    // They show up in the table (the page refreshed behind the sheet) with their tags...
    await page.getByLabel("Search links").fill(`${prefix}-menu`);
    const row = page.getByTestId("link-row").filter({ hasText: `/${prefix}-menu` });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("button", { name: "Filter by tag promo" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Filter by tag menus" })).toBeVisible();

    // ...and redirect like any other link.
    const response = await request.get(`/${prefix}-news`, { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe(`https://example.com/${prefix}/news`);
  });

  test("importing the same file again skips what already exists", async ({ page }) => {
    const prefix = uniqueCode("again");
    const file = fixture("import-happy.csv", prefix);

    let dialog = await openImport(page);
    await dialog.getByLabel("CSV file").setInputFiles(file);
    await dialog.getByRole("button", { name: "Import 3 links" }).click();
    await expect(dialog.getByTestId("import-summary")).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    dialog = await openImport(page);
    await dialog.getByLabel("CSV file").setInputFiles(file);

    // The two rows with custom codes are recognised as already imported; the code-less row is new.
    await expect(dialog.getByTestId("import-summary-line")).toContainText("2 already imported");
    await expect(dialog.getByRole("button", { name: "Import 1 link" })).toBeVisible();
  });

  test("reports bad rows, offers the failed rows as CSV, and still imports the good ones", async ({
    page,
  }) => {
    const prefix = uniqueCode("err");
    const dialog = await openImport(page);
    await dialog.getByLabel("CSV file").setInputFiles(fixture("import-errors.csv", prefix));

    await expect(dialog.getByTestId("import-summary-line")).toContainText("7 rows");
    await expect(dialog.getByTestId("import-summary-line")).toContainText("2 ready");
    await expect(dialog.getByTestId("import-summary-line")).toContainText("5 with problems");
    await expect(dialog.getByText("This code is reserved")).toBeVisible();
    await expect(dialog.getByText("Same code as row 6")).toBeVisible();
    await expect(dialog.getByText(/Invalid tag: ok\$bad/)).toBeVisible();

    await dialog.getByRole("button", { name: "Import 2 links" }).click();

    const summary = dialog.getByTestId("import-summary");
    await expect(summary.getByText("Created").locator("xpath=following-sibling::p")).toHaveText("2");
    await expect(summary.getByText("Failed").locator("xpath=following-sibling::p")).toHaveText("5");
    await expect(summary.getByTestId("import-failure-row")).toHaveCount(5);

    const downloadPromise = page.waitForEvent("download");
    await summary.getByRole("button", { name: /Download failed rows/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("import-errors-import-errors.csv");
    const csv = readFileSync(await download.path(), "utf8");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("url,title,custom_code,tags,folder,error,original_row");
    expect(lines.filter((l) => l !== "")).toHaveLength(6);
    expect(csv).toContain("not a url,Broken URL,,,,");
    expect(csv).toContain("This code is reserved");
    expect(csv).toContain("Same code as row 6");
  });

  test("the downloaded error file can be fixed and imported again", async ({ page }) => {
    const prefix = uniqueCode("fix");
    const dialog = await openImport(page);
    await dialog.getByLabel("CSV file").setInputFiles(fixture("import-errors.csv", prefix));
    await dialog.getByRole("button", { name: "Import 2 links" }).click();
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /Download failed rows/ }).click();
    const failed = readFileSync(await (await downloadPromise).path(), "utf8");

    // "Fix" the file: the same rows with working URLs and unique codes.
    const fixed = failed
      .replace("not a url", `https://example.com/${prefix}/fixed1`)
      .replace("ftp://example.com/file", `https://example.com/${prefix}/fixed2`)
      .replace(",dashboard,", `,${prefix}-ok,`)
      .replace(`,${prefix}-dup,`, `,${prefix}-dup2,`);
    await dialog.getByRole("button", { name: "Import another file" }).click();
    await dialog
      .getByLabel("CSV file")
      .setInputFiles({ name: "fixed.csv", mimeType: "text/csv", buffer: Buffer.from(fixed) });

    // Extra columns (error, original_row) are ignored; only the repaired rows are ready.
    await expect(dialog.getByTestId("import-summary-line")).toContainText("ready");
    await expect(dialog.getByRole("button", { name: /^Import [1-9]\d* links?$/ })).toBeVisible();
  });

  test("rejects files that are too big or have too many rows", async ({ page }) => {
    const dialog = await openImport(page);

    await dialog.getByLabel("CSV file").setInputFiles({
      name: "huge.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`url\n${"https://example.com/".padEnd(2.5 * 1024 * 1024, "a")}\n`),
    });
    await expect(dialog.getByRole("alert")).toContainText(/MB/);

    const rows = Array.from({ length: 1001 }, (_, i) => `https://example.com/many/${i}`).join("\n");
    await dialog.getByLabel("CSV file").setInputFiles({
      name: "many.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`url\n${rows}\n`),
    });
    await expect(dialog.getByRole("alert")).toContainText(/1,000 per import/);
  });

  test("is keyboard accessible: focus moves into the sheet, Tab stays inside, Escape closes and restores focus", async ({
    page,
  }) => {
    await page.goto("/dashboard/links");
    const trigger = page.getByRole("button", { name: "Import CSV" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Import links from CSV" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      await expect(dialog.locator(":focus")).toHaveCount(1);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
