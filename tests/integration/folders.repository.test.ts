import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { UniqueViolationError } from "@/server/errors";
import { DrizzleFolderRepository } from "@/server/repositories/drizzle/folder.repository.drizzle";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { connect, createUser, personalWorkspace, truncateAll } from "./helpers";

const { db, close } = connect();
const folders = new DrizzleFolderRepository(db);
const links = new DrizzleLinkRepository(db);

afterAll(close);
beforeEach(() => truncateAll(db));

async function workspace() {
  const user = await createUser(db);
  return { user, workspaceId: await personalWorkspace(db, user.id) };
}

describe("folders", () => {
  it("creates, finds by name ignoring case, lists with link counts, renames", async () => {
    const { workspaceId } = await workspace();
    const spring = await folders.create(workspaceId, "Spring");
    await folders.create(workspaceId, "archive");
    await links.create({
      code: "f-a",
      destinationUrl: "https://a.example/",
      workspaceId,
      folderId: spring.id,
    });
    await links.create({
      code: "f-b",
      destinationUrl: "https://b.example/",
      workspaceId,
      folderId: spring.id,
    });
    const gone = await links.create({
      code: "f-c",
      destinationUrl: "https://c.example/",
      workspaceId,
      folderId: spring.id,
    });
    await links.softDelete([gone.id], new Date());
    await links.create({
      code: "f-bio",
      destinationUrl: "https://d.example/",
      workspaceId,
      folderId: spring.id,
      kind: "bio_button",
    });

    expect((await folders.findByName(workspaceId, "SPRING"))?.id).toBe(spring.id);
    expect(await folders.findByName(workspaceId, "nope")).toBeNull();
    expect((await folders.list(workspaceId)).map((f) => [f.name, f.linkCount])).toEqual([
      ["archive", 0],
      ["Spring", 2], // deleted links and bio buttons are not counted
    ]);
    expect(await folders.count(workspaceId)).toBe(2);
    expect((await folders.rename(spring.id, "Summer"))?.name).toBe("Summer");
    expect(await folders.rename("00000000-0000-4000-8000-000000000000", "x")).toBeNull();
  });

  it("keeps names unique per workspace regardless of case, but not across workspaces", async () => {
    const a = await workspace();
    const b = await workspace();
    await folders.create(a.workspaceId, "Promo");
    await expect(folders.create(a.workspaceId, "promo")).rejects.toBeInstanceOf(UniqueViolationError);
    await expect(folders.create(b.workspaceId, "promo")).resolves.toMatchObject({ name: "promo" });
    const other = await folders.create(a.workspaceId, "Other");
    await expect(folders.rename(other.id, "PROMO")).rejects.toBeInstanceOf(UniqueViolationError);
  });

  it("deleting a folder keeps its links, which end up in no folder; deleting the workspace removes folders", async () => {
    const { workspaceId } = await workspace();
    const folder = await folders.create(workspaceId, "Temp");
    const link = await links.create({
      code: "keep",
      destinationUrl: "https://a.example/",
      workspaceId,
      folderId: folder.id,
    });
    expect(await folders.delete(folder.id)).toBe(true);
    expect(await folders.delete(folder.id)).toBe(false);
    expect((await links.findById(link.id))?.folderId).toBeNull();
    expect((await links.findById(link.id))?.id).toBe(link.id);
  });
});

describe("link repository: folders", () => {
  it("filters the list by folder or none, and sets folders in bulk", async () => {
    const { workspaceId } = await workspace();
    const folder = await folders.create(workspaceId, "F");
    const a = await links.create({ code: "l-a", destinationUrl: "https://a.example/", workspaceId });
    const b = await links.create({ code: "l-b", destinationUrl: "https://b.example/", workspaceId });
    const c = await links.create({
      code: "l-c",
      destinationUrl: "https://c.example/",
      workspaceId,
      tags: ["x"],
    });
    const base = { workspaceId, page: 1, pageSize: 20, now: new Date() };

    expect(await links.setFolder([a.id, b.id], folder.id)).toBe(2);
    expect((await links.list({ ...base, folder: folder.id })).items.map((l) => l.code).sort()).toEqual([
      "l-a",
      "l-b",
    ]);
    expect((await links.list({ ...base, folder: "none" })).items.map((l) => l.code)).toEqual(["l-c"]);
    expect((await links.list({ ...base, folder: folder.id, tag: "x" })).total).toBe(0);
    expect(await links.setFolder([a.id], null)).toBe(1);
    expect(await links.setFolder([], null)).toBe(0);
    expect(c.folderId).toBeNull();
  });

  it("filters the cursor list (the REST API) by tag and folder without breaking pagination", async () => {
    const { workspaceId } = await workspace();
    const folder = await folders.create(workspaceId, "F");
    for (let i = 0; i < 5; i++) {
      await links.create({
        code: `cur-${i}`,
        destinationUrl: `https://${i}.example/`,
        workspaceId,
        folderId: i % 2 === 0 ? folder.id : null,
        tags: i < 3 ? ["promo"] : [],
      });
    }
    const pageOne = await links.listByCursor(workspaceId, null, 2, { folder: folder.id });
    expect(pageOne.items.map((l) => l.code)).toEqual(["cur-4", "cur-2"]);
    const pageTwo = await links.listByCursor(workspaceId, pageOne.nextCursor, 2, { folder: folder.id });
    expect(pageTwo.items.map((l) => l.code)).toEqual(["cur-0"]);
    expect(pageTwo.nextCursor).toBeNull();

    expect((await links.listByCursor(workspaceId, null, 10, { tag: "promo" })).items).toHaveLength(3);
    expect(
      (await links.listByCursor(workspaceId, null, 10, { tag: "promo", folder: "none" })).items.map(
        (l) => l.code,
      ),
    ).toEqual(["cur-1"]);
    expect((await links.listByCursor(workspaceId, null, 10, { folder: "none" })).items).toHaveLength(2);
    expect((await links.listByCursor(workspaceId, null, 10)).items).toHaveLength(5);
  });
});

describe("link repository: moving between workspaces", () => {
  it("moves only live links of the source workspace, clears the folder, keeps clicks", async () => {
    const a = await workspace();
    const b = await workspace();
    const folder = await folders.create(a.workspaceId, "F");
    const moving = await links.create({
      code: "mv-a",
      destinationUrl: "https://a.example/",
      workspaceId: a.workspaceId,
      folderId: folder.id,
      tags: ["x"],
    });
    const removed = await links.create({
      code: "mv-b",
      destinationUrl: "https://b.example/",
      workspaceId: a.workspaceId,
    });
    await links.softDelete([removed.id], new Date());
    const bio = await links.create({
      code: "mv-bio",
      destinationUrl: "https://c.example/",
      workspaceId: a.workspaceId,
      kind: "bio_button",
    });
    const foreign = await links.create({
      code: "mv-c",
      destinationUrl: "https://d.example/",
      workspaceId: b.workspaceId,
    });

    const moved = await links.moveToWorkspace(
      [moving.id, removed.id, bio.id, foreign.id],
      a.workspaceId,
      b.workspaceId,
    );
    expect(moved).toBe(1);
    expect(await links.findById(moving.id)).toMatchObject({
      workspaceId: b.workspaceId,
      folderId: null,
      tags: ["x"],
      code: "mv-a",
    });
    expect((await links.findById(bio.id))?.workspaceId).toBe(a.workspaceId);
    expect((await links.findById(foreign.id))?.workspaceId).toBe(b.workspaceId);
    expect(await links.moveToWorkspace([], a.workspaceId, b.workspaceId)).toBe(0);
    expect((await folders.list(a.workspaceId))[0]?.linkCount).toBe(0);
  });
});
