import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { withDb } from "./db";
import { BROWSER_UA, createLinkViaForm, uniqueCode } from "./helpers";

const listed = (page: Page, code: string) => page.getByTestId("link-row").filter({ hasText: `/${code}` });

async function addFolder(page: Page, name: string) {
  await page.goto("/dashboard/links");
  await page.getByTestId("manage-folders").click();
  await page.getByLabel("New folder name").fill(name);
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByTestId("folder-item").filter({ hasText: name })).toBeVisible();
  await page.keyboard.press("Escape");
}

async function apiKey(page: Page, name: string) {
  await page.goto("/dashboard/api-keys");
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create key" }).click();
  const secret = (await page.getByTestId("api-key-secret").textContent())?.trim() ?? "";
  return { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
}

test.describe("folders", () => {
  test("create, file a link, filter, move in bulk, rename and delete without losing links", async ({
    page,
  }) => {
    const folder = `Spring ${uniqueCode("f")}`;
    const other = `Archive ${uniqueCode("f")}`;
    await addFolder(page, folder);
    await addFolder(page, other);

    // The link form offers the folders; the row shows where the link lives.
    const filed = uniqueCode("fld");
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill("https://example.com/folder-a");
    await page.getByLabel("Custom code (optional)").fill(filed);
    await page.getByRole("combobox", { name: "Folder (optional)" }).click();
    await page.getByRole("option", { name: folder, exact: true }).click();
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);

    const loose = (
      await createLinkViaForm(page, { url: "https://example.com/folder-b", code: uniqueCode("loose") })
    ).code;
    await page.goto("/dashboard/links");
    await expect(listed(page, filed).getByTestId("link-folder")).toHaveText(folder);
    await expect(listed(page, loose).getByTestId("link-folder")).toHaveCount(0);

    // Filter by folder, then by "no folder".
    await page.getByRole("combobox", { name: "Filter by folder" }).click();
    await page.getByRole("option", { name: folder, exact: true }).click();
    await expect(page).toHaveURL(/folder=[0-9a-f-]{36}/);
    await expect(listed(page, filed)).toBeVisible();
    await expect(listed(page, loose)).toHaveCount(0);
    await page.getByRole("combobox", { name: "Filter by folder" }).click();
    await page.getByRole("option", { name: "No folder" }).click();
    await expect(listed(page, loose)).toBeVisible();
    await expect(listed(page, filed)).toHaveCount(0);

    // Bulk move the loose link into the other folder.
    await page.getByRole("checkbox", { name: `Select /${loose}` }).check();
    await page.getByRole("combobox", { name: "Move to folder" }).click();
    await page.getByRole("option", { name: other, exact: true }).click();
    await expect(page.getByText("Moved 1 link")).toBeVisible();
    await page.goto("/dashboard/links");
    await expect(listed(page, loose).getByTestId("link-folder")).toHaveText(other);

    // Rename, then delete: the links survive and are simply unfiled.
    await page.getByTestId("manage-folders").click();
    const item = page.getByTestId("folder-item").filter({ hasText: other });
    await item.getByRole("button", { name: `Rename ${other}` }).click();
    const renamed = `${other} renamed`;
    await page.getByRole("textbox", { name: `Rename ${other}` }).fill(renamed);
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByTestId("folder-item").filter({ hasText: renamed })).toContainText("1 link");
    await page.getByRole("button", { name: `Delete ${renamed}` }).click();
    await page.getByRole("button", { name: "Delete folder" }).click();
    await expect(page.getByTestId("folder-item").filter({ hasText: renamed })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/dashboard/links");
    await expect(listed(page, loose)).toBeVisible();
    await expect(listed(page, loose).getByTestId("link-folder")).toHaveCount(0);
  });

  test("a duplicate name is refused in any case", async ({ page }) => {
    const name = `Dup ${uniqueCode("f")}`;
    await addFolder(page, name);
    await page.getByTestId("manage-folders").click();
    await page.getByLabel("New folder name").fill(name.toUpperCase());
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.getByText("A folder with this name already exists")).toBeVisible();
  });
});

test.describe("REST API: folders, filters and bulk import", () => {
  test("folder CRUD, folderId on links, tag and folder filters", async ({ page, request }) => {
    const auth = await apiKey(page, "Stage 3 key");
    const name = `API ${uniqueCode("f")}`;
    const created = await request.post("/api/v1/folders", { headers: auth, data: { name } });
    expect(created.status()).toBe(201);
    const folder = await created.json();
    expect(folder).toMatchObject({ name, linkCount: 0 });
    expect(
      (await request.post("/api/v1/folders", { headers: auth, data: { name: name.toUpperCase() } })).status(),
    ).toBe(409);
    expect((await request.post("/api/v1/folders", { headers: auth, data: { name: "   " } })).status()).toBe(
      400,
    );

    const tag = `t${Date.now().toString(36)}`;
    const code = uniqueCode("apif");
    const link = await request.post("/api/v1/links", {
      headers: auth,
      data: { url: "https://example.com/api-folder", code, folderId: folder.id, tags: [tag] },
    });
    expect(link.status()).toBe(201);
    expect((await link.json()).folder).toEqual({ id: folder.id, name });
    const plain = await request.post("/api/v1/links", {
      headers: auth,
      data: { url: "https://example.com/plain", code: uniqueCode("apip"), tags: [tag] },
    });
    const plainId = (await plain.json()).id;

    const byFolder = await (await request.get(`/api/v1/links?folder=${folder.id}`, { headers: auth })).json();
    expect(byFolder.data.map((l: { code: string }) => l.code)).toEqual([code]);
    const byTag = await (await request.get(`/api/v1/links?tag=${tag}`, { headers: auth })).json();
    expect(byTag.data).toHaveLength(2);
    const both = await (await request.get(`/api/v1/links?tag=${tag}&folder=none`, { headers: auth })).json();
    expect(both.data.map((l: { id: string }) => l.id)).toEqual([plainId]);
    expect((await request.get("/api/v1/links?folder=not-an-id", { headers: auth })).status()).toBe(400);

    // A folder id from nowhere is refused; moving between folders and out works through PATCH.
    const bad = await request.post("/api/v1/links", {
      headers: auth,
      data: { url: "https://example.com/x", folderId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(bad.status()).toBe(400);
    const moved = await request.patch(`/api/v1/links/${plainId}`, {
      headers: auth,
      data: { folderId: folder.id },
    });
    expect((await moved.json()).folder?.name).toBe(name);
    const out = await request.patch(`/api/v1/links/${plainId}`, { headers: auth, data: { folderId: null } });
    expect((await out.json()).folder).toBeNull();

    const renamed = await request.patch(`/api/v1/folders/${folder.id}`, {
      headers: auth,
      data: { name: `${name} v2` },
    });
    expect(await renamed.json()).toMatchObject({ name: `${name} v2`, linkCount: 1 });
    const list = await (await request.get("/api/v1/folders", { headers: auth })).json();
    expect(list.data.some((f: { id: string }) => f.id === folder.id)).toBe(true);
    expect((await request.delete(`/api/v1/folders/${folder.id}`, { headers: auth })).status()).toBe(204);
    const survivor = await (
      await request.get(`/api/v1/links/${(await link.json()).id}`, { headers: auth })
    ).json();
    expect(survivor.folder).toBeNull();
    expect((await request.delete(`/api/v1/folders/${folder.id}`, { headers: auth })).status()).toBe(404);
  });

  test("bulk import reports every row, skips repeats, creates folders and enforces limits", async ({
    page,
    request,
  }) => {
    const auth = await apiKey(page, "Import key");
    const p = uniqueCode("bulk");
    const folderName = `Imported ${p}`;
    const rows = [
      { url: "https://example.com/one", code: `${p}-one`, title: "One", tags: ["bulk"], folder: folderName },
      { url: "https://example.com/two", code: `${p}-two`, folder: folderName.toUpperCase() },
      { url: "not a url", code: `${p}-bad` },
      { url: "https://example.com/three" },
      { url: "https://example.com/four", code: "api" }, // reserved
    ];
    const first = await request.post("/api/v1/links/import", { headers: auth, data: { links: rows } });
    expect(first.status()).toBe(200);
    const body = await first.json();
    expect(body.results.map((r: { status: string }) => r.status)).toEqual([
      "created",
      "created",
      "failed",
      "created",
      "failed",
    ]);
    expect(body.results.map((r: { index: number }) => r.index)).toEqual([0, 1, 2, 3, 4]);
    expect(body.summary).toEqual({ created: 3, skipped: 0, failed: 2 });
    expect(body.results[0].shortUrl).toMatch(new RegExp(`/${p}-one$`));
    expect(body.results[4]).toMatchObject({ status: "failed", field: "customCode" });

    // Both rows share one folder (matched without regard to case).
    const folders = await (await request.get("/api/v1/folders", { headers: auth })).json();
    const matching = folders.data.filter(
      (f: { name: string }) => f.name.toLowerCase() === folderName.toLowerCase(),
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].linkCount).toBe(2);

    // Sending the same request again is safe: rows with a code are skipped, the rest are new links.
    const again = await (
      await request.post("/api/v1/links/import", { headers: auth, data: { links: rows.slice(0, 2) } })
    ).json();
    expect(again.summary).toEqual({ created: 0, skipped: 2, failed: 0 });
    expect(again.results[0]).toMatchObject({ status: "skipped", code: `${p}-one` });

    // Limits and malformed bodies.
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ url: `https://example.com/${i}` }));
    expect(
      (await request.post("/api/v1/links/import", { headers: auth, data: { links: tooMany } })).status(),
    ).toBe(400);
    expect(
      (await request.post("/api/v1/links/import", { headers: auth, data: { links: [] } })).status(),
    ).toBe(400);
    expect((await request.post("/api/v1/links/import", { headers: auth, data: "not json" })).status()).toBe(
      400,
    );
    const huge = await request.post("/api/v1/links/import", {
      headers: auth,
      data: { links: [{ url: "https://example.com/x", title: "x".repeat(300_000) }] },
    });
    expect(huge.status()).toBe(400);
    expect((await request.post("/api/v1/links/import", { data: { links: rows } })).status()).toBe(401);
  });

  test("the dashboard import reads a folder column", async ({ page }) => {
    const p = uniqueCode("csvf");
    const folder = `CSV ${p}`;
    const csv = `url,custom_code,folder\nhttps://example.com/csv-a,${p}-a,${folder}\nhttps://example.com/csv-b,${p}-b,${folder}\n`;
    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: "Import CSV" }).click();
    const dialog = page.getByRole("dialog", { name: "Import links from CSV" });
    await dialog
      .getByLabel("CSV file")
      .setInputFiles({ name: "folders.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(dialog.getByLabel("Folder", { exact: true })).toHaveValue("2");
    await dialog.getByRole("button", { name: "Import 2 links" }).click();
    await expect(dialog.getByTestId("import-summary")).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();
    await page.getByLabel("Search links").fill(p);
    await expect(listed(page, `${p}-a`).getByTestId("link-folder")).toHaveText(folder);
    await expect(listed(page, `${p}-b`).getByTestId("link-folder")).toHaveText(folder);
  });
});

test.describe("A/B split", () => {
  async function visit(request: APIRequestContext, code: string, agent: string) {
    const response = await request.get(`/${code}`, { maxRedirects: 0, headers: { "user-agent": agent } });
    expect(response.status()).toBe(302);
    return new URL(response.headers()["location"] ?? "").host;
  }

  test("visitors are divided between two pages, each visitor sticks to one, and analytics shows the result", async ({
    page,
    request,
  }) => {
    const code = uniqueCode("ab");
    await page.goto("/dashboard/links/new");
    await page.getByLabel("Long URL").fill("https://default.example/");
    await page.getByLabel("Custom code (optional)").fill(code);
    await page.getByText("Smart routing", { exact: true }).click();
    await page.getByRole("button", { name: /a\/b test/i }).click();
    await page.getByLabel("Destination A for rule 1").fill("https://a.example/landing");
    await page.getByLabel("Destination B for rule 1").fill("https://b.example/landing");
    await expect(page.getByTestId("split-total-1")).toHaveText("Shares add up to 100%");

    // Unequal shares that do not add up are explained, and block saving.
    await page.getByLabel("Share of A for rule 1").fill("80");
    await expect(page.getByTestId("split-total-1")).toContainText("add up to 130%");
    await page.getByTestId("link-submit").click();
    await expect(page.getByText(/add up to 130%/).first()).toBeVisible();
    await page.getByLabel("Share of A for rule 1").fill("50");
    await page.getByTestId("link-submit").click();
    await page.waitForURL(/\/dashboard\/links\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").at(-1) ?? "";

    const seen: Record<string, number> = {};
    const agents = Array.from({ length: 40 }, (_, i) => `${BROWSER_UA} split-${i}`);
    for (const agent of agents) {
      const host = await visit(request, code, agent);
      seen[host] = (seen[host] ?? 0) + 1;
    }
    expect(Object.keys(seen).sort()).toEqual(["a.example", "b.example"]);
    expect(seen["a.example"] ?? 0).toBeGreaterThan(8);
    expect(seen["b.example"] ?? 0).toBeGreaterThan(8);

    // The same visitor gets the same page every time.
    const first = await visit(request, code, agents[3] ?? "");
    for (let i = 0; i < 4; i++) expect(await visit(request, code, agents[3] ?? "")).toBe(first);

    // Analytics counts each variant.
    await expect(async () => {
      await page.goto(`/dashboard/links/${id}`);
      const table = page.getByTestId("variants-table");
      await expect(table).toBeVisible();
      const text = await page.getByTestId("analytics-kpis").innerText();
      expect(Number(/Total clicks\s+(\d+)/.exec(text)?.[1] ?? 0)).toBeGreaterThanOrEqual(45);
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId("variants-table")).toContainText("a.example");
    await expect(page.getByTestId("variants-table")).toContainText("50%");
    await expect(page.getByText("Variant A").first()).toBeVisible();
  });

  test("the REST API accepts splits and rejects bad ones", async ({ page, request }) => {
    const auth = await apiKey(page, "Split key");
    const good = await request.post("/api/v1/links", {
      headers: auth,
      data: {
        url: "https://default.example/",
        code: uniqueCode("abapi"),
        routingRules: [
          {
            url: "https://a.example/",
            variants: [
              { url: "https://a.example/", weight: 70 },
              { url: "https://b.example/", weight: 30, label: "New" },
            ],
          },
        ],
      },
    });
    expect(good.status()).toBe(201);
    expect((await good.json()).routingRules[0].variants).toEqual([
      { url: "https://a.example/", weight: 70 },
      { url: "https://b.example/", weight: 30, label: "New" },
    ]);
    const bad = await request.post("/api/v1/links", {
      headers: auth,
      data: {
        url: "https://default.example/",
        routingRules: [
          {
            url: "https://a.example/",
            variants: [
              { url: "https://a.example/", weight: 60 },
              { url: "https://b.example/", weight: 30 },
            ],
          },
        ],
      },
    });
    expect(bad.status()).toBe(400);
    expect(JSON.stringify(await bad.json())).toContain("add up to 90%");
  });
});

test.describe("moving links between workspaces", () => {
  test("links move to another workspace with their history, and leave their folder", async ({ page }) => {
    const team = `Move ${uniqueCode("team")}`;
    const folderName = `F ${uniqueCode("f")}`;
    // Start in the personal workspace with a filed link.
    await addFolder(page, folderName);
    const { id, code } = await createLinkViaForm(page, {
      url: "https://example.com/mover",
      code: uniqueCode("mv"),
    });
    await page.goto("/dashboard/links");
    await page.getByRole("checkbox", { name: `Select /${code}` }).check();
    await page.getByRole("combobox", { name: "Move to folder" }).click();
    await page.getByRole("option", { name: folderName, exact: true }).click();
    await expect(page.getByText("Moved 1 link")).toBeVisible();
    await withDb((sql) => sql`insert into clicks (link_id, visitor_hash) values (${id}, 'history')`);

    // With no other workspace there is nowhere to move to.
    await page.goto("/dashboard/links");
    await page.getByRole("checkbox", { name: `Select /${code}` }).check();
    const before = await page.getByRole("combobox", { name: "Move to workspace" }).count();

    await page.goto("/dashboard/team");
    await page.getByLabel("Team name").fill(team);
    await page.getByRole("button", { name: "Create team" }).click();
    await expect(page.getByTestId("workspace-switcher")).toHaveAccessibleName(`Workspace: ${team}`);
    await page.getByTestId("workspace-switcher").click();
    await page.getByTestId("workspace-option-personal").click();
    await page.waitForURL("**/dashboard");

    await page.goto("/dashboard/links");
    await expect(listed(page, code)).toBeVisible();
    await page.getByRole("checkbox", { name: `Select /${code}` }).check();
    await page.getByRole("combobox", { name: "Move to workspace" }).click();
    await page.getByRole("option", { name: team, exact: true }).click();
    await expect(page.getByText(/Moved 1 link to the other workspace/)).toBeVisible();
    expect(before).toBe(0);

    // Gone from here, present in the team, unfiled, with its clicks.
    await page.goto("/dashboard/links");
    await expect(listed(page, code)).toHaveCount(0);
    await page.getByTestId("workspace-switcher").click();
    await page.getByTestId(`workspace-option-${team}`).click();
    await page.waitForURL("**/dashboard");
    await page.goto("/dashboard/links");
    await expect(listed(page, code)).toBeVisible();
    await expect(listed(page, code).getByTestId("link-folder")).toHaveCount(0);
    const rows = await withDb((sql) => sql`select count(*)::int as n from clicks where link_id = ${id}`);
    expect(rows[0]?.["n"]).toBe(1);
    // The short link still works throughout.
    const response = await page.request.get(`/${code}`, {
      maxRedirects: 0,
      headers: { "user-agent": BROWSER_UA },
    });
    expect(response.status()).toBe(302);
  });
});
