import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";
import { createLinkViaForm, uniqueCode } from "./helpers";

/** A destination whose status code the test controls. It listens on loopback, which the e2e server may reach. */
async function startTarget() {
  const state = { status: 200 };
  const server = http.createServer((_req, res) => {
    res.writeHead(state.status, { "content-type": "text/plain" }).end("target");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    state,
    url: `http://127.0.0.1:${port}/page`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function recheck(page: Page, id: string) {
  await page.goto(`/dashboard/links/${id}/edit`);
  const card = page.getByTestId("link-health-card");
  await card.getByRole("button", { name: /re-check now/i }).click();
  // The check is done once its result toast shows and the refreshed card has settled.
  await expect(page.locator("[data-sonner-toast]").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test.describe("destination health", () => {
  test("a broken destination is flagged after repeated failures, filterable, and dismissible", async ({
    page,
  }) => {
    const target = await startTarget();
    try {
      const { id, code } = await createLinkViaForm(page, { url: target.url });

      // Healthy first.
      await recheck(page, id);
      await expect(page.getByText("The destination is reachable")).toBeVisible();
      await expect(page.getByTestId("link-health-card")).toContainText("Reachable");

      // The page breaks. One or two failures are not enough to raise an alarm...
      target.state.status = 500;
      await recheck(page, id);
      await expect(page.getByText(/last check failed/)).toBeVisible();
      await expect(page.getByTestId("link-health-card")).toContainText("Failing, retrying");
      await recheck(page, id);
      await expect(page.getByTestId("link-health-card")).toContainText("Failing, retrying");

      // ...the third one flags it.
      await recheck(page, id);
      await expect(page.getByTestId("link-health-card")).toContainText("Needs attention");
      await expect(page.getByTestId("link-health-card")).toContainText("server error");

      // The list shows the badge, the reason and the last check, and the filter finds it.
      await page.goto("/dashboard/links?health=attention");
      const row = page.getByTestId("link-row").filter({ hasText: `/${code}` });
      await expect(row.getByTestId("needs-attention")).toBeVisible();
      await expect(row).toContainText("The destination returned a server error");
      await expect(row).toContainText("checked");

      // Dismissing hides the badge and removes it from the filter, without touching the link.
      await row.getByRole("button", { name: `Actions for /${code}` }).click();
      await page.getByRole("menuitem", { name: /dismiss warning/i }).click();
      await expect(page.getByText("Warning dismissed")).toBeVisible();
      await expect(page.getByTestId("link-row").filter({ hasText: `/${code}` })).toHaveCount(0);
      await page.goto("/dashboard/links");
      const all = page.getByTestId("link-row").filter({ hasText: `/${code}` });
      await expect(all).toBeVisible();
      await expect(all.getByTestId("needs-attention")).toHaveCount(0);

      // Fixing the page and re-checking clears everything.
      target.state.status = 200;
      await recheck(page, id);
      await expect(page.getByTestId("link-health-card")).toContainText("Reachable");
      await expect(page.getByTestId("link-health-card")).not.toContainText("dismissed");
    } finally {
      await target.close();
    }
  });

  test("editing the destination wipes the old result", async ({ page }) => {
    const target = await startTarget();
    try {
      target.state.status = 404;
      const { id } = await createLinkViaForm(page, { url: target.url, code: uniqueCode("hfix") });
      for (let i = 0; i < 3; i++) await recheck(page, id);
      await expect(page.getByTestId("link-health-card")).toContainText("Needs attention");

      await page.getByLabel("Long URL").fill(`${target.url}?fixed=1`);
      await page.getByTestId("link-submit").click();
      await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);
      await page.goto(`/dashboard/links/${id}/edit`);
      await expect(page.getByTestId("link-health-card")).toContainText("Not checked yet");
    } finally {
      await target.close();
    }
  });

  test("password-protected links are not checked", async ({ page }) => {
    const { id } = await createLinkViaForm(page, {
      url: "https://example.com/private",
      password: "hunter22",
    });
    await page.goto(`/dashboard/links/${id}/edit`);
    const card = page.getByTestId("link-health-card");
    await expect(card).toContainText("Not checked");
    await expect(card.getByRole("button", { name: /re-check now/i })).toBeDisabled();
  });

  test("the administrator can switch the monitor and report emails per instance", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("combobox", { name: /Link health monitor/ })).toContainText("Default (on)");
    await expect(page.getByRole("combobox", { name: /Weekly report emails/ })).toContainText("Default (off)");
    await expect(page.getByLabel("Report hour (UTC)")).toBeVisible();

    await page.getByRole("combobox", { name: /Weekly report emails/ }).click();
    await page.getByRole("option", { name: "On", exact: true }).click();
    await page.getByRole("combobox", { name: "Report day" }).click();
    await page.getByRole("option", { name: "Friday" }).click();
    await page.getByLabel("Report hour (UTC)").fill("17");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Instance settings saved")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Currently: Friday at 17:00 UTC.")).toBeVisible();

    // Put everything back for the other specs.
    await page.getByRole("combobox", { name: /Weekly report emails/ }).click();
    await page.getByRole("option", { name: /Default/ }).click();
    await page.getByRole("combobox", { name: "Report day" }).click();
    await page.getByRole("option", { name: /Default/ }).click();
    await page.getByLabel("Report hour (UTC)").fill("");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Instance settings saved")).toBeVisible();
  });
});
