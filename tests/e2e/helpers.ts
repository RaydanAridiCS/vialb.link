import { expect, type Page } from "@playwright/test";

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

let counter = 0;
export function uniqueCode(prefix = "e2e") {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/** Creates a link through the dashboard form and returns its id + code. */
export async function createLinkViaForm(
  page: Page,
  options: { url: string; code?: string; password?: string; accessLimit?: string },
) {
  const code = options.code ?? uniqueCode();
  await page.goto("/dashboard/links/new");
  await page.getByLabel("Long URL").fill(options.url);
  await page.getByLabel("Custom code (optional)").fill(code);
  if (options.password) await page.getByLabel("Password (optional)").fill(options.password);
  if (options.accessLimit) {
    await page.getByRole("combobox", { name: "Access limit" }).click();
    await page.getByRole("option", { name: options.accessLimit, exact: true }).click();
  }
  await page.getByTestId("link-submit").click();
  await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").at(-1) ?? "";
  await expect(page.getByRole("heading", { level: 1 })).toContainText(code);
  return { id, code };
}
