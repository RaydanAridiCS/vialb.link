import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { withDb } from "./db";
import { uniqueCode } from "./helpers";

const SLACKBOT = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";
const DEST = "https://shop.example/private/path";

async function openStudio(page: Page) {
  await page.getByText("Social preview", { exact: true }).click();
}

const radio = (page: Page, name: string) => page.getByRole("radio", { name: new RegExp(`^${name}`) });

/** Creates a link through the form with a designed card. */
async function createCardLink(page: Page, headline = "Spring sale starts Friday") {
  const code = uniqueCode("sc");
  await page.goto("/dashboard/links/new");
  await page.getByLabel("Long URL").fill(DEST);
  await page.getByLabel("Custom code (optional)").fill(code);
  await openStudio(page);
  await radio(page, "Designed card").check({ force: true });
  await page.getByLabel("Headline").fill(headline);
  await page.getByTestId("link-submit").click();
  await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);
  return { code, id: page.url().split("/").at(-1) ?? "" };
}

async function preview(request: APIRequestContext, code: string): Promise<string> {
  const response = await request.get(`/${code}`, { maxRedirects: 0, headers: { "user-agent": SLACKBOT } });
  expect(response.status()).toBe(200);
  return response.text();
}

const imageUrl = (html: string) => /property="og:image" content="([^"]+)"/.exec(html)?.[1];

/** Width and height from a PNG's header. */
function pngSize(body: Buffer): { width: number; height: number } {
  expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

test.describe("social card studio", () => {
  test("design a card, save it, and crawlers get a 1200x630 PNG", async ({ page, request }) => {
    const { code } = await createCardLink(page);

    const png = await request.get(`/${code}/card`);
    expect(png.status()).toBe(200);
    expect(png.headers()["content-type"]).toBe("image/png");
    expect(png.headers()["cache-control"]).toContain("public");
    expect(pngSize(await png.body())).toEqual({ width: 1200, height: 630 });

    const html = await preview(request, code);
    const url = imageUrl(html) ?? "";
    expect(new URL(url).pathname).toBe(`/${code}/card`);
    expect(new URL(url).searchParams.get("v")).toBeTruthy();
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain('property="og:image:alt" content="Spring sale starts Friday"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    // The destination is never part of the card or the preview.
    expect(html).toContain("shop.example");
    expect(Buffer.from(await png.body()).includes("private/path")).toBe(false);
  });

  test("the card can be downloaded as a file", async ({ page, request }) => {
    const { code } = await createCardLink(page);
    const download = await request.get(`/${code}/card?download=1`);
    expect(download.headers()["content-disposition"]).toContain(`${code}-card.png`);
    const plain = await request.get(`/${code}/card`);
    expect(plain.headers()["content-disposition"]).toBeUndefined();
  });

  test("the form shows how the link will look in four apps, and updates as you design", async ({ page }) => {
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill(DEST);
    await page.getByLabel("Title (optional)").fill("Blue shoes");
    await openStudio(page);

    for (const app of ["whatsapp", "imessage", "slack", "x"]) {
      await expect(page.getByTestId(`preview-${app}`)).toContainText("Blue shoes");
    }
    await expect(page.getByTestId("social-previews").locator("img")).toHaveCount(0);

    await radio(page, "Designed card").check({ force: true });
    await expect(page.getByTestId("social-previews").locator("img")).toHaveCount(4);
    await page.getByLabel("Headline").fill("Half price");
    const src = await page.getByTestId("preview-slack").locator("img").getAttribute("src");
    expect(decodeURIComponent(src ?? "")).toContain("Half price");

    await page.getByText("Plum", { exact: true }).click();
    const plum = await page.getByTestId("preview-slack").locator("img").getAttribute("src");
    expect(decodeURIComponent(plum ?? "")).toContain("#3A1F4D");

    await page.getByRole("switch", { name: "Dark mode" }).click();
    await expect(page.getByTestId("preview-whatsapp")).toHaveClass(/0b141a/);
  });

  test("editing the design gives crawlers a new image URL", async ({ page, request }) => {
    const { code, id } = await createCardLink(page);
    const before = imageUrl(await preview(request, code));

    await page.goto(`/dashboard/links/${id}/edit`);
    await expect(page.getByLabel("Headline")).toHaveValue("Spring sale starts Friday");
    await page.getByLabel("Headline").fill("Autumn sale");
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);

    const after = imageUrl(await preview(request, code));
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
    expect((await request.get(`/${code}/card`)).status()).toBe(200);
  });

  test("an image link replaces the card, and 'no image' removes both", async ({ page, request }) => {
    const { code, id } = await createCardLink(page);

    await page.goto(`/dashboard/links/${id}/edit`);
    await radio(page, "Image link").check({ force: true });
    await page.getByLabel("Image link", { exact: true }).fill("https://img.example/cover.png");
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);
    expect(imageUrl(await preview(request, code))).toBe("https://img.example/cover.png");
    expect((await request.get(`/${code}/card`)).status()).toBe(404);

    await page.goto(`/dashboard/links/${id}/edit`);
    await expect(page.getByLabel("Image link", { exact: true })).toHaveValue("https://img.example/cover.png");
    await radio(page, "No image").check({ force: true });
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);
    const html = await preview(request, code);
    expect(html).not.toContain("og:image");
    expect(html).toContain('name="twitter:card" content="summary"');
  });

  test("a saved card can be removed again without errors", async ({ page, request }) => {
    const { code, id } = await createCardLink(page);
    await page.goto(`/dashboard/links/${id}/edit`);
    await radio(page, "No image").check({ force: true });
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);
    expect((await request.get(`/${code}/card`)).status()).toBe(404);
  });

  test("an empty headline is explained and nothing is saved", async ({ page }) => {
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill(DEST);
    await page.getByLabel("Custom code (optional)").fill(uniqueCode("scbad"));
    await openStudio(page);
    await radio(page, "Designed card").check({ force: true });
    await page.getByTestId("link-submit").click();
    await expect(page.getByRole("alert").filter({ hasText: "Add a headline for the card" })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/links\/new$/);
  });

  test("there is no card for links without one, for disabled links, or for unknown codes", async ({
    page,
    request,
  }) => {
    const plain = uniqueCode("scplain");
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill(DEST);
    await page.getByLabel("Custom code (optional)").fill(plain);
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);
    const none = await request.get(`/${plain}/card`);
    expect(none.status()).toBe(404);
    expect(none.headers()["cache-control"]).toContain("no-store");

    const { code, id } = await createCardLink(page);
    expect((await request.get(`/${code}/card`)).status()).toBe(200);
    await withDb((sql) => sql`update links set is_enabled = false where id = ${id}`);
    expect((await request.get(`/${code}/card`)).status()).toBe(404);

    expect((await request.get("/definitely-not-a-code/card")).status()).toBe(404);
  });

  test("the REST API accepts, returns and validates a card design", async ({ page, request }) => {
    await page.goto("/dashboard/api-keys");
    await page.getByLabel("Name").fill("Card key");
    await page.getByRole("button", { name: "Create key" }).click();
    const secret = (await page.getByTestId("api-key-secret").textContent())?.trim() ?? "";
    const auth = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };

    const code = uniqueCode("scapi");
    const design = {
      template: "split",
      palette: "ocean",
      headline: "From the API",
      subline: "",
      showHost: false,
    };
    const created = await request.post("/api/v1/links", {
      headers: auth,
      data: { url: DEST, code, cardDesign: design },
    });
    expect(created.status()).toBe(201);
    const link = (await created.json()) as { id: string; cardDesign: unknown };
    expect(link.cardDesign).toEqual(design);
    expect((await request.get(`/${code}/card`)).status()).toBe(200);

    const untouched = await request.patch(`/api/v1/links/${link.id}`, {
      headers: auth,
      data: { title: "Renamed" },
    });
    expect(((await untouched.json()) as { cardDesign: unknown }).cardDesign).toEqual(design);

    for (const bad of [
      { ...design, headline: "" },
      { ...design, headline: "x".repeat(81) },
      { ...design, palette: "orange" },
      { ...design, template: "fancy" },
      { ...design, showHost: "yes" },
    ]) {
      const response = await request.patch(`/api/v1/links/${link.id}`, {
        headers: auth,
        data: { cardDesign: bad },
      });
      expect(response.status(), JSON.stringify(bad)).toBe(400);
    }

    const cleared = await request.patch(`/api/v1/links/${link.id}`, {
      headers: auth,
      data: { cardDesign: null },
    });
    expect(((await cleared.json()) as { cardDesign: unknown }).cardDesign).toBeNull();
    expect((await request.get(`/${code}/card`)).status()).toBe(404);
  });
});
