import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/constants";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { buildFixture, defined, users, userActor } from "../support/fixtures";

async function seed() {
  const f = buildFixture();
  const team = await f.workspaces.create(users.alice, "Team");
  const make = async (actor: typeof users.alice, code: string, extra: Record<string, unknown> = {}) =>
    (
      await f.links.create(
        actor,
        { destinationUrl: `https://${code}.example/`, customCode: code, ...extra },
        { ip: null },
      )
    ).link;
  const asAlice = (workspaceId: string, role: "owner" | "admin" | "editor" | "viewer" = "owner") =>
    userActor("alice", "user", { id: workspaceId, role });
  return { f, team, make, asAlice };
}

describe("LinkService.moveToWorkspace", () => {
  it("moves links when the actor is an owner of both workspaces, keeping everything but the folder", async () => {
    const { f, team, make } = await seed();
    const folder = await f.folders.create(users.alice, "Old folder");
    const link = await make(users.alice, "movable", {
      folderId: folder.id,
      tags: ["promo"],
      title: "Keep me",
    });
    await f.links.setPublicStats(users.alice, link.id, "enable");
    await f.clickRepo.record({
      linkId: link.id,
      visitorHash: "v",
      country: "FR",
      region: null,
      city: null,
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      deviceType: "desktop",
      referrerHost: null,
      referrerUrl: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      language: null,
      isBot: false,
    });
    const before = await f.links.get(users.alice, link.id);

    expect(await f.links.moveToWorkspace(users.alice, [link.id], team.id)).toBe(1);

    const inTeam = await f.actAs("alice", team.id);
    const after = await f.links.get(inTeam, link.id);
    expect(after).toMatchObject({
      code: "movable",
      title: "Keep me",
      tags: ["promo"],
      folder: null,
      statsUrl: before.statsUrl,
    });
    expect(f.clickRepo.rows).toHaveLength(1); // history follows the link
    expect((await f.links.list(inTeam, {})).items.map((l) => l.code)).toEqual(["movable"]);
    expect((await f.links.list(users.alice, {})).items).toEqual([]);
    // The folder still exists where it was; only the link left it.
    expect((await f.folders.list(users.alice)).map((x) => [x.name, x.linkCount])).toEqual([
      ["Old folder", 0],
    ]);
    // The old workspace no longer reaches the link.
    await expect(f.links.get(users.alice, link.id)).rejects.toThrow(ForbiddenError);
  });

  it("moves several links at once and reports the count", async () => {
    const { f, team, make } = await seed();
    const ids = [
      (await make(users.alice, "aaa")).id,
      (await make(users.alice, "bbb")).id,
      (await make(users.alice, "ccc")).id,
    ];
    expect(await f.links.moveToWorkspace(users.alice, ids, team.id)).toBe(3);
    expect((await f.links.list(await f.actAs("alice", team.id), {})).total).toBe(3);
  });

  it("needs owner or admin in the workspace the links are in", async () => {
    const { f, team, make, asAlice } = await seed();
    const link = await make(users.alice, "src-role");
    await f.links.moveToWorkspace(users.alice, [link.id], team.id);
    f.workspaceRepo.members.push({
      workspaceId: "ws-bob",
      userId: "alice",
      role: "owner",
      joinedAt: new Date(),
    });

    // alice is only an editor in the team now: she can edit the link but not move it out.
    defined(f.workspaceRepo.members.find((m) => m.workspaceId === team.id && m.userId === "alice")).role =
      "editor";
    await expect(f.links.moveToWorkspace(asAlice(team.id, "editor"), [link.id], "ws-bob")).rejects.toThrow(
      ForbiddenError,
    );
    defined(f.workspaceRepo.members.find((m) => m.workspaceId === team.id && m.userId === "alice")).role =
      "admin";
    expect(await f.links.moveToWorkspace(asAlice(team.id, "admin"), [link.id], "ws-bob")).toBe(1);
  });

  it("needs owner or admin in the target workspace too, and refuses non-members", async () => {
    const { f, team, make } = await seed();
    const link = await make(users.bob, "tgt-role");
    // bob is not in the team at all.
    await expect(f.links.moveToWorkspace(users.bob, [link.id], team.id)).rejects.toThrow(ForbiddenError);
    f.workspaceRepo.members.push({
      workspaceId: team.id,
      userId: "bob",
      role: "editor",
      joinedAt: new Date(),
    });
    await expect(f.links.moveToWorkspace(users.bob, [link.id], team.id)).rejects.toThrow(
      /owner or admin of both/,
    );
    defined(f.workspaceRepo.members.find((m) => m.workspaceId === team.id && m.userId === "bob")).role =
      "viewer";
    await expect(f.links.moveToWorkspace(users.bob, [link.id], team.id)).rejects.toThrow(ForbiddenError);
    defined(f.workspaceRepo.members.find((m) => m.workspaceId === team.id && m.userId === "bob")).role =
      "admin";
    expect(await f.links.moveToWorkspace(users.bob, [link.id], team.id)).toBe(1);
  });

  it("refuses viewers and people who cannot edit the links in the first place", async () => {
    const { f, team, make, asAlice } = await seed();
    const link = await make(users.alice, "viewer-no");
    await expect(f.links.moveToWorkspace(asAlice("ws-alice", "viewer"), [link.id], team.id)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(f.links.moveToWorkspace(users.bob, [link.id], "ws-bob")).rejects.toThrow(ForbiddenError);
    await expect(
      f.links.moveToWorkspace({ kind: "anonymous", ip: null }, [link.id], team.id),
    ).rejects.toThrow();
  });

  it("lets an instance admin move links between any workspaces", async () => {
    const { f, team, make } = await seed();
    const link = await make(users.alice, "by-admin");
    expect(await f.links.moveToWorkspace(users.admin, [link.id], team.id)).toBe(1);
  });

  it("rejects bad requests", async () => {
    const { f, team, make } = await seed();
    const a = await make(users.alice, "bad-1");
    const bio = await f.linkRepo.create({
      code: "bio-mv",
      destinationUrl: "https://b.example/",
      kind: "bio_button",
      workspaceId: "ws-alice",
      userId: "alice",
    });
    await expect(f.links.moveToWorkspace(users.alice, [], team.id)).rejects.toThrow(ValidationError);
    await expect(f.links.moveToWorkspace(users.alice, [a.id], "ws-alice")).rejects.toThrow(
      /already in that workspace/,
    );
    await expect(
      f.links.moveToWorkspace(users.alice, [a.id], "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(/Workspace not found/);
    await expect(f.links.moveToWorkspace(users.alice, [bio.id], team.id)).rejects.toThrow(/Bio page buttons/);
    await expect(
      f.links.moveToWorkspace(
        users.alice,
        Array.from(
          { length: LIMITS.moveLinksMax + 1 },
          (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        ),
        team.id,
      ),
    ).rejects.toThrow(/At most 100/);
    await expect(
      f.links.moveToWorkspace(users.alice, ["00000000-0000-4000-8000-0000000000aa"], team.id),
    ).rejects.toThrow();
  });

  it("does not move links of two different workspaces in one go (instance admins)", async () => {
    const { f, make } = await seed();
    const a = await make(users.alice, "mix-a");
    const b = await make(users.bob, "mix-b");
    await expect(f.links.moveToWorkspace(users.admin, [a.id, b.id], "ws-root")).rejects.toThrow(
      /one workspace at a time/,
    );
  });

  it("a moved link keeps being checked by the health monitor under its new workspace", async () => {
    const f = buildFixture({ healthMonitorEnabled: true });
    const team = await f.workspaces.create(users.alice, "Team");
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://moved.example/" },
      { ip: null },
    );
    await f.links.moveToWorkspace(users.alice, [link.id], team.id);
    const [candidate] = await f.healthRepo.listDue(f.clock.now(), 10);
    expect(candidate?.workspaceId).toBe(team.id);
  });
});
