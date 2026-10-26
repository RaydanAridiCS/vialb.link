import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { apiKeys, links, user, workspaceInvites, workspaceMembers, workspaces } from "@/server/db/schema";
import { DrizzleApiKeyRepository } from "@/server/repositories/drizzle/api-key.repository.drizzle";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { DrizzleWorkspaceRepository } from "@/server/repositories/drizzle/workspace.repository.drizzle";
import { connect, createUser, truncateAll } from "./helpers";

const { db, close } = connect();
const repo = new DrizzleWorkspaceRepository(db);
const linkRepo = new DrizzleLinkRepository(db);
const keyRepo = new DrizzleApiKeyRepository(db);

afterAll(close);
beforeEach(() => truncateAll(db));

const future = new Date(Date.now() + 86_400_000);
let hashSeq = 0;
const invite = (workspaceId: string, email: string, role: "viewer" | "editor" = "viewer") => ({
  workspaceId,
  email,
  role,
  tokenHash: `hash-${(hashSeq += 1)}`,
  invitedBy: null as never,
  expiresAt: future,
});

/** A team owned by `owner`. */
async function team(ownerId: string, name = "Acme") {
  return repo.create({ name, createdBy: ownerId });
}

describe("personal workspaces", () => {
  it("are created once per user, even when many requests ask at the same time", async () => {
    const alice = await createUser(db);
    const results = await Promise.all(Array.from({ length: 12 }, () => repo.ensurePersonal(alice.id)));
    expect(new Set(results.map((w) => w.id)).size).toBe(1);
    expect(results[0]).toMatchObject({ name: "Personal", isPersonal: true });
    expect(await db.select().from(workspaces).where(eq(workspaces.personalUserId, alice.id))).toHaveLength(1);
    expect(await repo.getRole(results[0]?.id ?? "", alice.id)).toBe("owner");
  });

  it("belong to the account: deleting the user deletes the workspace and its links", async () => {
    const alice = await createUser(db);
    const personal = await repo.ensurePersonal(alice.id);
    await linkRepo.create({
      code: "mine",
      destinationUrl: "https://a.example",
      userId: alice.id,
      workspaceId: personal.id,
    });
    await db.delete(user).where(eq(user.id, alice.id));
    expect(await repo.findById(personal.id)).toBeNull();
    expect(await linkRepo.findByCode("mine")).toBeNull();
  });
});

describe("teams", () => {
  it("are created with their creator as the only owner, and counted per owner", async () => {
    const alice = await createUser(db);
    const acme = await team(alice.id);
    expect(acme.isPersonal).toBe(false);
    expect(await repo.getRole(acme.id, alice.id)).toBe("owner");
    await team(alice.id, "Second");
    expect(await repo.countTeamsOwnedBy(alice.id)).toBe(2);
    await repo.ensurePersonal(alice.id);
    expect(await repo.countTeamsOwnedBy(alice.id)).toBe(2);
  });

  it("list personal first, then by name, with member counts and the caller's role", async () => {
    const alice = await createUser(db);
    const bob = await createUser(db);
    await repo.ensurePersonal(alice.id);
    const zeta = await team(alice.id, "Zeta");
    await team(alice.id, "Alpha");
    await db.insert(workspaceMembers).values({ workspaceId: zeta.id, userId: bob.id, role: "viewer" });

    const mine = await repo.listForUser(alice.id);
    expect(mine.map((w) => [w.name, w.isPersonal, w.role, w.memberCount])).toEqual([
      ["Personal", true, "owner", 1],
      ["Alpha", false, "owner", 1],
      ["Zeta", false, "owner", 2],
    ]);
    expect((await repo.listForUser(bob.id)).map((w) => [w.name, w.role])).toEqual([["Zeta", "viewer"]]);
  });

  it("list members with their names and emails", async () => {
    const alice = await createUser(db, { name: "Alice A", email: "alice@x.io" });
    const acme = await team(alice.id);
    expect(await repo.listMembers(acme.id)).toMatchObject([
      { userId: alice.id, name: "Alice A", email: "alice@x.io", role: "owner" },
    ]);
  });

  it("can be renamed and deleted, taking links, invitations and keys with them", async () => {
    const alice = await createUser(db);
    const acme = await team(alice.id);
    expect((await repo.rename(acme.id, "Acme Inc"))?.name).toBe("Acme Inc");
    expect(await repo.rename("00000000-0000-4000-8000-000000000000", "x")).toBeNull();

    await linkRepo.create({
      code: "team-link",
      destinationUrl: "https://a.example",
      userId: alice.id,
      workspaceId: acme.id,
    });
    await keyRepo.create({
      userId: alice.id,
      workspaceId: acme.id,
      name: "ci",
      prefix: "tw_aaaaaaaa",
      hash: "h",
    });
    await repo.saveInvite(invite(acme.id, "bob@x.io"));

    expect(await repo.delete(acme.id)).toBe(true);
    expect(await repo.delete(acme.id)).toBe(false);
    expect(await linkRepo.findByCode("team-link")).toBeNull();
    expect(await db.select().from(apiKeys)).toHaveLength(0);
    expect(await db.select().from(workspaceInvites)).toHaveLength(0);
    expect(
      await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, acme.id)),
    ).toHaveLength(0);
  });
});

describe("the last owner", () => {
  it("cannot be demoted or removed", async () => {
    const alice = await createUser(db);
    const acme = await team(alice.id);
    expect(await repo.setRole(acme.id, alice.id, "admin")).toBe(false);
    expect(await repo.removeMember(acme.id, alice.id)).toBe(false);
    expect(await repo.getRole(acme.id, alice.id)).toBe("owner");
    expect(await repo.setRole(acme.id, alice.id, "owner")).toBe(true);
  });

  it("can step down once another owner exists", async () => {
    const alice = await createUser(db);
    const bob = await createUser(db);
    const acme = await team(alice.id);
    await db.insert(workspaceMembers).values({ workspaceId: acme.id, userId: bob.id, role: "editor" });
    expect(await repo.setRole(acme.id, bob.id, "owner")).toBe(true);
    expect(await repo.setRole(acme.id, alice.id, "viewer")).toBe(true);
    expect(await repo.removeMember(acme.id, bob.id)).toBe(false);
    expect(await repo.setRole(acme.id, "nobody", "viewer")).toBe(false);
  });

  it("survives two owners demoting each other at the same moment", async () => {
    for (let round = 0; round < 8; round++) {
      await truncateAll(db);
      const alice = await createUser(db);
      const bob = await createUser(db);
      const acme = await team(alice.id);
      await db.insert(workspaceMembers).values({ workspaceId: acme.id, userId: bob.id, role: "owner" });

      const results = await Promise.all([
        repo.setRole(acme.id, alice.id, "viewer"),
        repo.setRole(acme.id, bob.id, "viewer"),
      ]);
      expect(results.filter(Boolean), `round ${round}`).toHaveLength(1);
      const owners = (await repo.listMembers(acme.id)).filter((m) => m.role === "owner");
      expect(owners).toHaveLength(1);
    }
  });

  it("survives two owners leaving at the same moment", async () => {
    for (let round = 0; round < 8; round++) {
      await truncateAll(db);
      const alice = await createUser(db);
      const bob = await createUser(db);
      const acme = await team(alice.id);
      await db.insert(workspaceMembers).values({ workspaceId: acme.id, userId: bob.id, role: "owner" });

      const results = await Promise.all([
        repo.removeMember(acme.id, alice.id),
        repo.removeMember(acme.id, bob.id),
      ]);
      expect(results.filter(Boolean), `round ${round}`).toHaveLength(1);
      expect(await repo.listMembers(acme.id)).toHaveLength(1);
    }
  });
});

describe("invitations", () => {
  it("replace the pending one for the same address and stay findable by token hash only", async () => {
    const alice = await createUser(db);
    const acme = await team(alice.id);
    const first = await repo.saveInvite({ ...invite(acme.id, "bob@x.io", "viewer"), invitedBy: alice.id });
    const second = await repo.saveInvite({
      ...invite(acme.id, "bob@x.io", "editor"),
      tokenHash: "second-hash",
      invitedBy: alice.id,
    });
    expect(second.id).toBe(first.id);
    expect(await repo.listInvites(acme.id)).toHaveLength(1);
    expect(await repo.findInviteByTokenHash(first.id)).toBeNull();
    expect(await repo.findInviteByTokenHash("second-hash")).toMatchObject({
      role: "editor",
      workspaceName: "Acme",
    });
    expect(await repo.deleteInvite(second.id, "00000000-0000-4000-8000-000000000000")).toBe(false);
    expect(await repo.deleteInvite(second.id, acme.id)).toBe(true);
  });

  it("are accepted into a membership with the invited role, once", async () => {
    const alice = await createUser(db);
    const bob = await createUser(db);
    const acme = await team(alice.id);
    const saved = await repo.saveInvite({ ...invite(acme.id, "bob@x.io", "editor"), invitedBy: alice.id });
    expect(await repo.acceptInvite(saved.id, bob.id, 10)).toBe("joined");
    expect(await repo.getRole(acme.id, bob.id)).toBe("editor");
    expect(await repo.acceptInvite(saved.id, bob.id, 10)).toBe("missing");
  });

  it("do not change the role of someone who is already a member", async () => {
    const alice = await createUser(db);
    const bob = await createUser(db);
    const acme = await team(alice.id);
    await db.insert(workspaceMembers).values({ workspaceId: acme.id, userId: bob.id, role: "admin" });
    const saved = await repo.saveInvite({ ...invite(acme.id, "bob@x.io", "viewer"), invitedBy: alice.id });
    expect(await repo.acceptInvite(saved.id, bob.id, 10)).toBe("already_member");
    expect(await repo.getRole(acme.id, bob.id)).toBe("admin");
    expect(await repo.listInvites(acme.id)).toHaveLength(0);
  });

  it("respect the member limit even when accepted at the same moment", async () => {
    const alice = await createUser(db);
    const bob = await createUser(db);
    const carol = await createUser(db);
    const acme = await team(alice.id);
    const forBob = await repo.saveInvite({ ...invite(acme.id, "bob@x.io"), invitedBy: alice.id });
    const forCarol = await repo.saveInvite({ ...invite(acme.id, "carol@x.io"), invitedBy: alice.id });

    // One free place: Alice plus one more.
    const results = await Promise.all([
      repo.acceptInvite(forBob.id, bob.id, 2),
      repo.acceptInvite(forCarol.id, carol.id, 2),
    ]);
    expect([...results].sort()).toEqual(["full", "joined"]);
    expect(await repo.listMembers(acme.id)).toHaveLength(2);
  });
});

describe("closing an account", () => {
  it("finds teams the person would strand: sole owner with other members", async () => {
    const alice = await createUser(db);
    const bob = await createUser(db);
    const stranded = await team(alice.id, "Stranded");
    await db.insert(workspaceMembers).values({ workspaceId: stranded.id, userId: bob.id, role: "editor" });
    const solo = await team(alice.id, "Solo");
    const shared = await team(alice.id, "Shared owners");
    await db.insert(workspaceMembers).values({ workspaceId: shared.id, userId: bob.id, role: "owner" });
    await repo.ensurePersonal(alice.id);

    expect((await repo.findStrandedTeams(alice.id)).map((w) => w.name)).toEqual(["Stranded"]);
    expect(await repo.findStrandedTeams(bob.id)).toEqual([]);
    void solo;
  });

  it("deletes teams only the person belongs to, and nothing else", async () => {
    const alice = await createUser(db);
    const bob = await createUser(db);
    const solo = await team(alice.id, "Solo");
    const shared = await team(alice.id, "Shared");
    await db.insert(workspaceMembers).values({ workspaceId: shared.id, userId: bob.id, role: "viewer" });
    await repo.ensurePersonal(alice.id);

    expect(await repo.deleteTeamsWhereOnlyMember(alice.id)).toBe(1);
    expect(await repo.findById(solo.id)).toBeNull();
    expect(await repo.findById(shared.id)).not.toBeNull();
    expect((await repo.ensurePersonal(alice.id)).isPersonal).toBe(true);
  });

  it("keeps a team's links when their creator's account goes away", async () => {
    const alice = await createUser(db);
    const bob = await createUser(db);
    const acme = await team(alice.id);
    await db.insert(workspaceMembers).values({ workspaceId: acme.id, userId: bob.id, role: "owner" });
    await linkRepo.create({
      code: "kept",
      destinationUrl: "https://a.example",
      userId: alice.id,
      workspaceId: acme.id,
    });

    await db.delete(user).where(eq(user.id, alice.id));
    const kept = await linkRepo.findByCode("kept");
    expect(kept).toMatchObject({ userId: null, workspaceId: acme.id });
    expect(await repo.getRole(acme.id, alice.id)).toBeNull();
    expect(await db.select().from(links).where(eq(links.workspaceId, acme.id))).toHaveLength(1);
  });
});

describe("links by workspace", () => {
  it("only list, tag and count what is in the asked-for workspace", async () => {
    const alice = await createUser(db);
    const personal = await repo.ensurePersonal(alice.id);
    const acme = await team(alice.id);
    await linkRepo.create({
      code: "p1",
      destinationUrl: "https://a.example",
      userId: alice.id,
      workspaceId: personal.id,
      tags: ["mine"],
    });
    await linkRepo.create({
      code: "t1",
      destinationUrl: "https://a.example",
      userId: alice.id,
      workspaceId: acme.id,
      tags: ["team"],
    });

    const now = new Date();
    expect(
      (await linkRepo.list({ page: 1, pageSize: 10, now, workspaceId: acme.id })).items.map((l) => l.code),
    ).toEqual(["t1"]);
    expect(await linkRepo.listTags(acme.id)).toEqual(["team"]);
    expect(await linkRepo.listTags(personal.id)).toEqual(["mine"]);
    expect((await linkRepo.listByCursor(personal.id, null, 10)).items.map((l) => l.code)).toEqual(["p1"]);
    expect((await linkRepo.overview(acme.id, now)).totalLinks).toBe(1);
    // The export is "links I created", across workspaces.
    expect((await linkRepo.listAllByUser(alice.id)).map((l) => l.code).sort()).toEqual(["p1", "t1"]);
  });

  it("claims anonymous links into a workspace, and only once", async () => {
    const alice = await createUser(db);
    const acme = await team(alice.id);
    const anon = await linkRepo.create({
      code: "anon",
      destinationUrl: "https://a.example",
      claimTokenHash: "tok",
    });
    expect(await linkRepo.claim([anon.id], alice.id, acme.id)).toBe(1);
    expect(await linkRepo.claim([anon.id], alice.id, acme.id)).toBe(0);
    expect(await linkRepo.findById(anon.id)).toMatchObject({
      userId: alice.id,
      workspaceId: acme.id,
      claimTokenHash: null,
    });
  });
});

describe("API keys by workspace", () => {
  it("list per workspace, or all of a person's keys", async () => {
    const alice = await createUser(db);
    const personal = await repo.ensurePersonal(alice.id);
    const acme = await team(alice.id);
    await keyRepo.create({
      userId: alice.id,
      workspaceId: personal.id,
      name: "a",
      prefix: "tw_aaaaaaaa",
      hash: "1",
    });
    await keyRepo.create({
      userId: alice.id,
      workspaceId: acme.id,
      name: "b",
      prefix: "tw_bbbbbbbb",
      hash: "2",
    });
    expect((await keyRepo.listByUser(alice.id)).map((k) => k.name).sort()).toEqual(["a", "b"]);
    expect((await keyRepo.listByUser(alice.id, acme.id)).map((k) => k.name)).toEqual(["b"]);
    expect((await keyRepo.findActiveByPrefix("tw_bbbbbbbb"))?.workspaceId).toBe(acme.id);
  });
});
