import { expect, test } from "@playwright/test";

test.describe("email preferences", () => {
  test("a person can opt out of the weekly report and the choice sticks", async ({ page }) => {
    await page.goto("/dashboard/settings");
    const card = page.getByTestId("email-preferences");
    await expect(card).toBeVisible();
    // The e2e instance has no email delivery, and says so plainly.
    await expect(card).toContainText("no email delivery configured");
    await expect(card.getByRole("button", { name: /send me a preview/i })).toBeDisabled();

    const weekly = card.getByRole("switch", { name: "Weekly report" });
    await expect(weekly).toBeChecked();
    await weekly.click();
    await expect(page.getByText("Email preferences saved")).toBeVisible();

    await page.reload();
    await expect(
      page.getByTestId("email-preferences").getByRole("switch", { name: "Weekly report" }),
    ).not.toBeChecked();
    await expect(
      page.getByTestId("email-preferences").getByRole("switch", { name: "Broken links" }),
    ).toBeChecked();

    // Opt back in so the account is left as it was found.
    await page.getByTestId("email-preferences").getByRole("switch", { name: "Weekly report" }).click();
    await expect(page.getByText("Email preferences saved")).toBeVisible();
  });

  test("the data export includes the choices", async ({ page }) => {
    const response = await page.request.get("/api/app/me/export");
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.emailPreferences).toEqual({ weeklyReport: true, brokenLinksEmail: true });
  });
});
