import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createLinkViaForm } from "./helpers";

async function openQrDialog(page: Page, code: string) {
  await page.goto("/dashboard/links");
  await page.getByLabel("Search links").fill(code);
  await expect(page.getByTestId("link-row")).toHaveCount(1);
  await page.getByRole("button", { name: `Actions for /${code}` }).click();
  await page.getByRole("menuitem", { name: "QR code" }).click();
  const dialog = page.getByRole("dialog", { name: `QR code for /${code}` });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function previewSvg(dialog: ReturnType<Page["getByRole"]>): Promise<string> {
  const src = (await dialog.getByTestId("qr-preview").getAttribute("src")) ?? "";
  return decodeURIComponent(src.replace("data:image/svg+xml;charset=utf-8,", ""));
}

const pngSize = (buffer: Buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });

test.describe("QR customizer", () => {
  test("new links start with high error correction and no frame", async ({ page }) => {
    await page.goto("/dashboard/links/new");

    await expect(page.getByLabel("Error correction")).toHaveValue("H");
    await expect(page.getByRole("radio", { name: "No frame" })).toBeChecked();
    await expect(page.getByLabel("Badge text")).toHaveCount(0);
  });

  test("design a framed QR in the form, save it, and see it in the dialog", async ({ page }) => {
    await page.goto("/dashboard/links/new");
    const code = `qrf-${Date.now().toString(36)}`;
    await page.getByLabel("Long URL").fill("https://example.com/qr-form");
    await page.getByLabel("Custom code (optional)").fill(code);

    await page.getByRole("radio", { name: "Badge under the code" }).click();
    await page.getByLabel("Badge text").fill("Order here");
    await page.getByLabel("Error correction").selectOption("Q");
    await expect(page.getByTestId("qr-preview")).toBeVisible();
    expect(await page.getByTestId("qr-preview").getAttribute("src")).toContain(
      encodeURIComponent("Order here"),
    );

    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);

    const dialog = await openQrDialog(page, code);
    await expect(dialog.getByLabel("Error correction")).toHaveValue("Q");
    await expect(dialog.getByRole("radio", { name: "Badge under the code" })).toBeChecked();
    await expect(dialog.getByLabel("Badge text")).toHaveValue("Order here");
    expect(await previewSvg(dialog)).toContain(">Order here</text>");
  });

  test("downloads are SVG and PNG (also high-res), and match the preview", async ({ page }) => {
    const { id, code } = await createLinkViaForm(page, { url: "https://example.com/qr-download" });
    const dialog = await openQrDialog(page, code);

    await dialog.getByRole("radio", { name: "Badge under the code" }).click();
    await dialog.getByLabel("Badge text").fill("Menu");
    await dialog.getByLabel("Foreground", { exact: true }).fill("#0F4C3A");
    const preview = await previewSvg(dialog);
    expect(preview).toContain(">Menu</text>");
    expect(preview).toContain('fill="#0F4C3A"');

    const svgLink = dialog.getByRole("link", { name: "SVG" });
    const pngLink = dialog.getByRole("link", { name: "PNG", exact: true });
    const hiResLink = dialog.getByRole("link", { name: "High-res PNG" });

    // SVG: what the server sends is exactly what the dialog drew.
    const svgResponse = await page.request.get((await svgLink.getAttribute("href")) ?? "");
    expect(svgResponse.status()).toBe(200);
    expect(svgResponse.headers()["content-type"]).toContain("image/svg+xml");
    expect(svgResponse.headers()["content-disposition"]).toBe(`attachment; filename="qr-${id}.svg"`);
    expect(await svgResponse.text()).toBe(preview);

    // PNG: framed codes are taller than wide, at the requested size.
    const pngResponse = await page.request.get((await pngLink.getAttribute("href")) ?? "");
    expect(pngResponse.headers()["content-type"]).toBe("image/png");
    const png = await pngResponse.body();
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(pngSize(png).width).toBe(1024);
    expect(pngSize(png).height).toBeGreaterThan(1024);

    const hiRes = await page.request.get((await hiResLink.getAttribute("href")) ?? "");
    expect(hiRes.headers()["content-disposition"]).toBe(`attachment; filename="qr-${id}-hires.png"`);
    expect(pngSize(await hiRes.body()).width).toBe(2048);

    // Clicking the buttons really downloads a file with the right name and content.
    const svgDownload = page.waitForEvent("download");
    await svgLink.click();
    const download = await svgDownload;
    expect(download.suggestedFilename()).toBe(`qr-${id}.svg`);
    expect(readFileSync(await download.path(), "utf8")).toContain(">Menu</text>");
  });

  test("an unframed code is still a plain PNG at the old size", async ({ page }) => {
    const { code } = await createLinkViaForm(page, { url: "https://example.com/qr-plain" });
    const dialog = await openQrDialog(page, code);

    const href = (await dialog.getByRole("link", { name: "PNG", exact: true }).getAttribute("href")) ?? "";
    const png = await (await page.request.get(href)).body();

    expect(png.subarray(1, 4).toString()).toBe("PNG");
    const { width, height } = pngSize(png);
    expect(width).toBe(height);
    expect(width).toBeLessThanOrEqual(1024);
  });

  test("'Save as default' keeps the design for next time", async ({ page }) => {
    const { code } = await createLinkViaForm(page, { url: "https://example.com/qr-save" });
    let dialog = await openQrDialog(page, code);
    await dialog.getByRole("radio", { name: "Badge under the code" }).click();
    await dialog.getByLabel("Badge text").fill("Saved text");
    await dialog.getByLabel("Error correction").selectOption("L");

    await dialog.getByRole("button", { name: /Save as default/ }).click();
    await expect(dialog).toBeHidden();

    await page.reload();
    dialog = await openQrDialog(page, code);
    await expect(dialog.getByLabel("Badge text")).toHaveValue("Saved text");
    await expect(dialog.getByLabel("Error correction")).toHaveValue("L");
  });

  test("warns about weak colours and blocks unreadable ones", async ({ page }) => {
    const { code } = await createLinkViaForm(page, { url: "https://example.com/qr-contrast" });
    const dialog = await openQrDialog(page, code);

    await dialog.getByLabel("Foreground", { exact: true }).fill("#FFFFFF");
    await dialog.getByLabel("Background", { exact: true }).fill("#000000");
    await expect(dialog.getByRole("status")).toContainText(/inverted|dark background/i);
    await expect(dialog.getByRole("link", { name: "SVG" })).toBeVisible();

    await dialog.getByLabel("Background", { exact: true }).fill("#FFFFFF");
    await expect(dialog.getByRole("alert")).toContainText(/too similar/i);
    await expect(dialog.getByRole("button", { name: "High-res PNG" })).toBeDisabled();
    await expect(dialog.getByRole("link", { name: "SVG" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /Save as default/ })).toBeDisabled();
  });

  test("the form refuses unreadable colours with a message", async ({ page }) => {
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill("https://example.com/qr-blocked");
    await page.getByLabel("Foreground", { exact: true }).fill("#EEEEEE");

    await expect(page.getByRole("alert").filter({ hasText: /too similar/i })).toBeVisible();
  });

  test("keyboard: focus moves into the dialog, Tab stays inside it, Escape closes it", async ({ page }) => {
    const { code } = await createLinkViaForm(page, { url: "https://example.com/qr-keys" });
    const dialog = await openQrDialog(page, code);
    await expect(dialog.locator(":focus")).toHaveCount(1);

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      await expect(dialog.locator(":focus")).toHaveCount(1);
    }

    // the radio group is reachable and operable by keyboard
    await dialog.getByRole("radio", { name: "No frame" }).focus();
    // Radix checks a radio on arrow focus only while the key is held, so hold it like a person would.
    await page.keyboard.down("ArrowDown");
    await expect(dialog.getByRole("radio", { name: "Badge under the code" })).toBeChecked();
    await page.keyboard.up("ArrowDown");
    await expect(dialog.getByLabel("Badge text")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("REST API: options on create and update, and QR downloads that honour them", async ({
    page,
    request,
  }) => {
    await page.goto("/dashboard/api-keys");
    await page.getByLabel("Name").fill("QR e2e key");
    await page.getByRole("button", { name: "Create key" }).click();
    const secret = (await page.getByTestId("api-key-secret").textContent())?.trim() ?? "";
    const headers = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

    const created = await request.post("/api/v1/links", {
      headers,
      data: { url: "https://example.com/api-qr", qrFrame: "badge", qrFrameText: "Via API", qrEcc: "Q" },
    });
    expect(created.status()).toBe(201);
    const link = (await created.json()) as {
      id: string;
      qrEcc: string;
      qrFrame: string;
      qrFrameText: string;
    };
    expect(link).toMatchObject({ qrEcc: "Q", qrFrame: "badge", qrFrameText: "Via API" });

    // a plain create uses the new defaults
    const plain = (await (
      await request.post("/api/v1/links", { headers, data: { url: "https://example.com/api-plain" } })
    ).json()) as { qrEcc: string; qrFrame: string; qrFrameText: string | null };
    expect(plain).toMatchObject({ qrEcc: "H", qrFrame: "none", qrFrameText: null });

    const svg = await request.get(`/api/v1/links/${link.id}/qr.svg`, { headers });
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
    expect(await svg.text()).toContain(">Via API</text>");

    const overridden = await request.get(`/api/v1/links/${link.id}/qr.svg?frame=none&ecc=L`, { headers });
    expect(await overridden.text()).not.toContain("<text");

    const png = await request.get(`/api/v1/links/${link.id}/qr.png?size=640`, { headers });
    expect(pngSize(await png.body())).toMatchObject({ width: 640 });

    const updated = await request.patch(`/api/v1/links/${link.id}`, {
      headers,
      data: { qrFrameText: null, qrEcc: "L" },
    });
    expect(await updated.json()).toMatchObject({ qrEcc: "L", qrFrameText: null, qrFrame: "badge" });
    expect(await (await request.get(`/api/v1/links/${link.id}/qr.svg`, { headers })).text()).toContain(
      ">Scan me</text>",
    );

    const invalid = await request.get(`/api/v1/links/${link.id}/qr.svg?ecc=Z`, { headers });
    expect(invalid.status()).toBe(400);
    const unreadable = await request.post("/api/v1/links", {
      headers,
      data: { url: "https://example.com/x", qrFgColor: "#EEEEEE", qrBgColor: "#FFFFFF" },
    });
    expect(unreadable.status()).toBe(400);
  });
});
