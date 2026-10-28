import { describe, expect, it } from "vitest";
import { folderNameProblem, normalizeFolderName } from "@/lib/folders";
import { LIMITS } from "@/lib/constants";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { buildFixture, defined, users } from "../support/fixtures";

describe("folder names", () => {
  it("collapses whitespace and rejects the unusable", () => {
    expect(normalizeFolderName("  Spring \t  sale\n")).toBe("Spring sale");
    expect(normalizeFolderName("   ")).toBeNull();
    expect(folderNameProblem(null)).toMatch(/name/);
    expect(folderNameProblem("x".repeat(LIMITS.folderNameMax))).toBeNull();
    expect(folderNameProblem("x".repeat(LIMITS.folderNameMax + 1))).toMatch(/at most/);
    expect(folderNameProblem("bad\u0007name")).toMatch(/control/);
  });
});

const viewerOf = (id: string) => ({ ...users.alice, workspace: { id, role: "viewer" as const } });
const editorOf = (id: string) => ({ ...users.alice, workspace: { id, role: "editor" as const } });

describe("FolderService", () => {
  it("creates, lists with counts, renames and deletes", async () => {
    const f = buildFixture();
    const spring = await f.folders.create(users.alice, "  Spring   sale ");
    expect(spring.name).toBe("Spring sale");
    await f.folders.create(users.alice, "archive");
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://a.example/", folderId: spring.id },
      { ip: null },
    );

    expect((await f.folders.list(users.alice)).map((x) => [x.name, x.linkCount])).toEqual([
      ["archive", 0],
      ["Spring sale", 1],
    ]);
    expect((await f.folders.rename(users.alice, spring.id, "Summer")).name).toBe("Summer");
    await f.folders.delete(users.alice, spring.id);
    expect((await f.links.get(users.alice, link.id)).folder).toBeNull(); // the link survives, ungrouped
    expect((await f.folders.list(users.alice)).map((x) => x.name)).toEqual(["archive"]);
  });

  it("refuses duplicates in any case, but allows the same name in another workspace", async () => {
    const f = buildFixture();
    await f.folders.create(users.alice, "Promo");
    await expect(f.folders.create(users.alice, "PROMO")).rejects.toThrow(ConflictError);
    const other = await f.folders.create(users.bob, "promo");
    expect(other.name).toBe("promo");
    const second = await f.folders.create(users.alice, "Other");
    await expect(f.folders.rename(users.alice, second.id, "promo")).rejects.toThrow(ConflictError);
    expect((await f.folders.rename(users.alice, second.id, "OTHER")).name).toBe("OTHER"); // renaming to itself is fine
  });

  it("validates names and caps the number per workspace", async () => {
    const f = buildFixture();
    await expect(f.folders.create(users.alice, "   ")).rejects.toThrow(ValidationError);
    await expect(f.folders.create(users.alice, "x".repeat(41))).rejects.toThrow(ValidationError);
    for (let i = 0; i < LIMITS.foldersPerWorkspaceMax; i++) await f.folderRepo.create("ws-alice", `f${i}`);
    await expect(f.folders.create(users.alice, "one too many")).rejects.toThrow(/at most 100/);
  });

  it("follows workspace roles: anyone lists, editors and above change, never across workspaces", async () => {
    const f = buildFixture();
    const folder = await f.folders.create(users.alice, "Team");
    expect(await f.folders.list(viewerOf("ws-alice"))).toHaveLength(1);
    await expect(f.folders.create(viewerOf("ws-alice"), "x")).rejects.toThrow(ForbiddenError);
    await expect(f.folders.rename(viewerOf("ws-alice"), folder.id, "x")).rejects.toThrow(ForbiddenError);
    await expect(f.folders.delete(viewerOf("ws-alice"), folder.id)).rejects.toThrow(ForbiddenError);
    expect((await f.folders.rename(editorOf("ws-alice"), folder.id, "Crew")).name).toBe("Crew");

    // Bob cannot touch Alice's folder, and Alice's folder is not in Bob's list.
    await expect(f.folders.rename(users.bob, folder.id, "x")).rejects.toThrow(ForbiddenError);
    await expect(f.folders.delete(users.bob, folder.id)).rejects.toThrow(ForbiddenError);
    expect(await f.folders.list(users.bob)).toEqual([]);
    await expect(f.folders.delete(users.alice, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(
      NotFoundError,
    );
    await f.folders.delete(users.admin, folder.id); // instance admins may
  });
});

describe("links and folders", () => {
  async function seed() {
    const f = buildFixture();
    const mine = await f.folders.create(users.alice, "Mine");
    const theirs = await f.folders.create(users.bob, "Theirs");
    const make = async (code: string, extra: Record<string, unknown> = {}) =>
      (
        await f.links.create(
          users.alice,
          { destinationUrl: `https://${code}.example/`, customCode: code, ...extra },
          { ip: null },
        )
      ).link;
    return { f, mine, theirs, make };
  }

  it("files a link on create and edit, and only in a folder of its own workspace", async () => {
    const { f, mine, theirs, make } = await seed();
    const link = await make("filed", { folderId: mine.id });
    expect(link.folder).toEqual({ id: mine.id, name: "Mine" });
    await expect(make("bad", { folderId: theirs.id })).rejects.toThrow(/Folder not found/);
    await expect(make("ghost", { folderId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(
      ValidationError,
    );

    expect((await f.links.update(users.alice, link.id, { folderId: null })).folder).toBeNull();
    expect((await f.links.update(users.alice, link.id, { folderId: mine.id })).folder?.name).toBe("Mine");
    expect((await f.links.update(users.alice, link.id, { title: "x" })).folder?.name).toBe("Mine"); // untouched
    await expect(f.links.update(users.alice, link.id, { folderId: theirs.id })).rejects.toThrow(
      ValidationError,
    );
  });

  it("lists by folder or by 'none', combined with other filters", async () => {
    const { f, mine, make } = await seed();
    const a = await make("aaa", { folderId: mine.id, tags: ["promo"] });
    const b = await make("bbb", { folderId: mine.id });
    const c = await make("ccc");
    const ids = async (input: Parameters<typeof f.links.list>[1]) =>
      (await f.links.list(users.alice, input)).items.map((l) => l.id).sort();
    expect(await ids({ folder: mine.id })).toEqual([a.id, b.id].sort());
    expect(await ids({ folder: "none" })).toEqual([c.id]);
    expect(await ids({ folder: mine.id, tag: "promo" })).toEqual([a.id]);
    expect(await ids({})).toHaveLength(3);
  });

  it("moves links in bulk, and out again, but not into another workspace's folder", async () => {
    const { f, mine, theirs, make } = await seed();
    const a = await make("mv1");
    const b = await make("mv2");
    expect(await f.links.moveToFolder(users.alice, [a.id, b.id], mine.id)).toBe(2);
    expect((await f.folders.list(users.alice))[0]?.linkCount).toBe(2);
    expect(await f.links.moveToFolder(users.alice, [a.id], null)).toBe(1);
    await expect(f.links.moveToFolder(users.alice, [a.id], theirs.id)).rejects.toThrow(/own workspace/);
    await expect(
      f.links.moveToFolder(users.alice, [a.id], "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(/Folder not found/);
    await expect(f.links.moveToFolder(users.alice, [], mine.id)).rejects.toThrow(ValidationError);
    // Someone who cannot edit the link cannot move it.
    await expect(f.links.moveToFolder(users.bob, [b.id], theirs.id)).rejects.toThrow(ForbiddenError);
    await expect(f.links.moveToFolder(viewerOf("ws-alice"), [b.id], mine.id)).rejects.toThrow(ForbiddenError);
  });

  it("import: a folder name is found or created, and shared across rows", async () => {
    const { f, mine } = await seed();
    const results = await f.links.importLinks(users.alice, [
      { row: 2, destinationUrl: "https://one.example/", customCode: "imp1", folder: "MINE" },
      { row: 3, destinationUrl: "https://two.example/", customCode: "imp2", folder: "  New   one " },
      { row: 4, destinationUrl: "https://three.example/", customCode: "imp3", folder: "new one" },
      { row: 5, destinationUrl: "https://four.example/", customCode: "imp4" },
      { row: 6, destinationUrl: "https://five.example/", customCode: "imp5", folder: "x".repeat(60) },
    ]);
    expect(results.map((r) => r.status)).toEqual(["created", "created", "created", "created", "failed"]);
    expect(results[4]).toMatchObject({ field: "folder" });
    const folders = await f.folders.list(users.alice);
    expect(folders.map((x) => [x.name, x.linkCount])).toEqual([
      ["Mine", 1],
      ["New one", 2],
    ]);
    expect(defined(folders.find((x) => x.id === mine.id)).linkCount).toBe(1);
  });

  it("import stops creating folders at the limit but still imports the other rows", async () => {
    const f = buildFixture();
    for (let i = 0; i < LIMITS.foldersPerWorkspaceMax; i++) await f.folderRepo.create("ws-alice", `f${i}`);
    const results = await f.links.importLinks(users.alice, [
      { row: 2, destinationUrl: "https://one.example/", customCode: "lim1", folder: "f3" },
      { row: 3, destinationUrl: "https://two.example/", customCode: "lim2", folder: "brand new" },
    ]);
    expect(results.map((r) => r.status)).toEqual(["created", "failed"]);
  });
});
