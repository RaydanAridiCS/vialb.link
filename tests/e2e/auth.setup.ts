import { expect, test as setup } from "@playwright/test";

export const ADMIN = { name: "Ada Admin", email: "ada@example.com", password: "correct-horse-battery" };

/** Signs up the first user (who becomes the instance admin) and stores the session. */
setup("sign up the first user", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(ADMIN.name);
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByLabel("Confirm password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("heading", { name: /Hi, Ada/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
  await page.context().storageState({ path: "tests/e2e/.auth/admin.json" });
});
