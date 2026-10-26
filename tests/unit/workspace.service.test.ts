import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/constants";
import type { WorkspaceRole } from "@/lib/permissions";
import {
  ForbiddenError,
  GoneError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";
import { inviteTokenHash } from "@/server/services/workspace.service";
import { buildFixture, users, type FixtureOptions } from "../support/fixtures";

const PEOPLE = ["alice", "bob", "carol", "dave", "erin"] as const;

/** A fixture with five people on the instance and a team called Acme owned by Alice. */
async function setup(options: FixtureOptions = {}) {
  const f = buildFixture(options);
  for (const id of PEOPLE) {
    f.userRepo.rows.push({
      id,
      email: `${id}@x.io`,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      role: "user",
      banned: false,
    });
    if (id !== "alice" && id !== "bob") f.workspaceRepo.seedPersonal(id, `ws-${id}`);
  }
  const team = await f.workspaces.create(users.alice, "Acme");

  const tokenOf = (url: string) => url.split("/invite/")[1] ?? "";
  /** Invites `person` as `role` (by Alice, the owner) and has them accept. */
  const join = async (person: string, role: WorkspaceRole) => {
    const { url } = await f.workspaces.invite(users.alice, team.id, `${person}@x.io`, role);
    await f.workspaces.acceptInvite(await f.actAs(person), tokenOf(url));
    return f.actAs(person, team.id);
  };
  const roleOf = async (person: string) =>
    (await f.workspaceRepo.listMembers(team.id)).find((m) => m.userId === person)?.role;
  return { f, team, tokenOf, join, roleOf };
}

/** Alice's personal workspace, as the first entry of her list. */
async function personalOf(f: Awaited<ReturnType<typeof setup>>["f"]) {
  const [personal] = await f.workspaces.listMine(users.alice);
  if (!personal) throw new Error("no personal workspace");
  return personal;
}

describe("resolveAccess", () => {
  it("defaults to the personal workspace, creating it on first use", async () => {
    const f = buildFixture();
    const first = await f.workspaces.resolveAccess("zoe");
    expect(first.role).toBe("owner");
    expect((await f.workspaceRepo.findById(first.id))?.isPersonal).toBe(true);
    expect(await f.workspaces.resolveAccess("zoe")).toEqual(first);
    expect(await f.workspaces.resolveAccess("zoe", null)).toEqual(first);
  });

  it("uses the requested workspace only for members, with their own role there", async () => {
    const { f, team, join } = await setup();
    await join("bob", "viewer");
    expect(await f.workspaces.resolveAccess("bob", team.id)).toEqual({ id: team.id, role: "viewer" });
    expect(await f.workspaces.resolveAccess("alice", team.id)).toEqual({ id: team.id, role: "owner" });
    // Carol never joined: a copied id gets her nowhere.
    expect(await f.workspaces.resolveAccess("carol", team.id)).toEqual({ id: "ws-carol", role: "owner" });
    expect((await f.workspaces.resolveAccess("bob", "not-a-workspace")).id).not.toBe("not-a-workspace");
  });

  it("falls back to the personal workspace as soon as membership ends", async () => {
    const { f, team, join } = await setup();
    await join("bob", "editor");
    await f.workspaces.removeMember(users.alice, team.id, "bob");
    expect((await f.workspaces.resolveAccess("bob", team.id)).id).toBe((await f.actAs("bob")).workspace.id);
  });
});

describe("creating, renaming and deleting workspaces", () => {
  it("creates a team with its creator as the only owner and tidies the name", async () => {
    const f = buildFixture();
    const team = await f.workspaces.create(users.alice, "  Big   Team ");
    expect(team).toMatchObject({ name: "Big Team", isPersonal: false });
    expect(await f.workspaceRepo.listMembers(team.id)).toMatchObject([{ userId: "alice", role: "owner" }]);
  });

  it("lists the personal workspace first, then teams", async () => {
    const f = buildFixture();
    await f.workspaces.create(users.alice, "Zeta");
    await f.workspaces.create(users.alice, "Alpha");
    const mine = await f.workspaces.listMine(users.alice);
    expect(mine.map((w) => w.name)).toEqual(["Personal", "Alpha", "Zeta"]);
    expect(mine.map((w) => w.isPersonal)).toEqual([true, false, false]);
  });

  it("rejects empty and too-long names, anonymous callers and too many teams", async () => {
    const f = buildFixture();
    await expect(f.workspaces.create(users.alice, "   ")).rejects.toBeInstanceOf(ValidationError);
    await expect(
      f.workspaces.create(users.alice, "x".repeat(LIMITS.workspaceNameMax + 1)),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(f.workspaces.create(users.anon, "Nope")).rejects.toBeInstanceOf(UnauthorizedError);
    for (let i = 0; i < LIMITS.workspacesPerUserMax; i++) await f.workspaces.create(users.bob, `Team ${i}`);
    await expect(f.workspaces.create(users.bob, "One too many")).rejects.toThrow(/at most/);
  });

  it("lets owners and admins rename, but not editors, viewers or outsiders", async () => {
    const { f, team, join } = await setup();
    await join("bob", "admin");
    await join("carol", "editor");
    await join("dave", "viewer");
    expect((await f.workspaces.rename(users.alice, team.id, "Acme Inc")).name).toBe("Acme Inc");
    expect((await f.workspaces.rename(await f.actAs("bob"), team.id, "Acme Ltd")).name).toBe("Acme Ltd");
    for (const person of ["carol", "dave"]) {
      await expect(f.workspaces.rename(await f.actAs(person), team.id, "Hacked")).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }
    await expect(f.workspaces.rename(await f.actAs("erin"), team.id, "Hacked")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("never renames or deletes a personal workspace", async () => {
    const f = buildFixture();
    const personal = await personalOf(f);
    await expect(f.workspaces.rename(users.alice, personal.id, "Mine")).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(f.workspaces.delete(users.alice, personal.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("lets only owners delete a team", async () => {
    const { f, team, join } = await setup();
    await join("bob", "admin");
    await expect(f.workspaces.delete(await f.actAs("bob"), team.id)).rejects.toBeInstanceOf(ForbiddenError);
    await f.workspaces.delete(users.alice, team.id);
    expect(await f.workspaceRepo.findById(team.id)).toBeNull();
    await expect(f.workspaces.members(users.alice, team.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("inviting", () => {
  it("emails a link, returns it too, and stores only a hash of the token", async () => {
    const { f, team, tokenOf } = await setup();
    const { invite, url, emailSent } = await f.workspaces.invite(
      users.alice,
      team.id,
      "  Bob@X.io ",
      "editor",
    );
    expect(emailSent).toBe(true);
    expect(invite).toMatchObject({ email: "bob@x.io", role: "editor", workspaceId: team.id });
    expect(url).toMatch(/^https:\/\/sho\.rt\/invite\/[A-Za-z0-9_-]{30,}$/);
    expect(f.mailer.sent).toHaveLength(1);
    expect(f.mailer.sent[0]).toMatchObject({ to: "bob@x.io" });
    expect(f.mailer.sent[0]?.text).toContain(url);
    expect(f.mailer.sent[0]?.subject).toContain("Acme");
    expect(JSON.stringify([...f.workspaceRepo.invites.values()])).not.toContain(tokenOf(url));
  });

  it("still hands over the link when email is not set up or fails", async () => {
    const { f, team } = await setup({ mailConfigured: false });
    const first = await f.workspaces.invite(users.alice, team.id, "bob@x.io", "viewer");
    expect(first.emailSent).toBe(false);
    expect(first.url).toContain("/invite/");
    expect(f.mailer.sent).toHaveLength(0);

    const broken = await setup();
    broken.f.mailer.failNext = true;
    const second = await broken.f.workspaces.invite(users.alice, broken.team.id, "bob@x.io", "viewer");
    expect(second.emailSent).toBe(false);
    expect(second.url).toContain("/invite/");
  });

  it("escapes names in the email's HTML", async () => {
    const { f, join } = await setup();
    const evil = await f.workspaces.create(users.alice, "<img src=x onerror=alert(1)>");
    await f.workspaces.invite(users.alice, evil.id, "bob@x.io", "viewer");
    const html = f.mailer.sent.at(-1)?.html ?? "";
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    void join;
  });

  it("limits who can invite and with which role", async () => {
    const { f, team, join } = await setup();
    await join("bob", "admin");
    await join("carol", "editor");
    const adminActor = await f.actAs("bob");
    await expect(f.workspaces.invite(adminActor, team.id, "erin@x.io", "admin")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(f.workspaces.invite(adminActor, team.id, "erin@x.io", "owner")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(f.workspaces.invite(adminActor, team.id, "erin@x.io", "viewer")).resolves.toBeDefined();
    await expect(
      f.workspaces.invite(await f.actAs("carol"), team.id, "dave@x.io", "viewer"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(f.workspaces.invite(users.alice, team.id, "dave@x.io", "owner")).resolves.toBeDefined();
    await expect(
      f.workspaces.invite(users.alice, team.id, "dave@x.io", "superuser" as WorkspaceRole),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps outsiders out and personal workspaces private", async () => {
    const { f, team } = await setup();
    await expect(
      f.workspaces.invite(await f.actAs("erin"), team.id, "dave@x.io", "viewer"),
    ).rejects.toBeInstanceOf(NotFoundError);
    const personal = await personalOf(f);
    await expect(f.workspaces.invite(users.alice, personal.id, "bob@x.io", "viewer")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects bad addresses and people who are already members", async () => {
    const { f, team, join } = await setup();
    for (const email of ["", "nope", "a@b", "a b@c.io", `${"x".repeat(250)}@c.io`]) {
      await expect(f.workspaces.invite(users.alice, team.id, email, "viewer"), email).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    await join("bob", "viewer");
    await expect(f.workspaces.invite(users.alice, team.id, "BOB@x.io", "editor")).rejects.toThrow(
      /already a member/,
    );
  });

  it("replaces a pending invitation when it is sent again, which kills the old link", async () => {
    const { f, team, tokenOf } = await setup();
    const first = await f.workspaces.invite(users.alice, team.id, "bob@x.io", "viewer");
    const second = await f.workspaces.invite(users.alice, team.id, "bob@x.io", "editor");
    expect(second.invite.id).toBe(first.invite.id);
    expect(f.workspaceRepo.invites.size).toBe(1);
    const bob = await f.actAs("bob");
    await expect(f.workspaces.acceptInvite(bob, tokenOf(first.url))).rejects.toBeInstanceOf(NotFoundError);
    await f.workspaces.acceptInvite(bob, tokenOf(second.url));
    expect(await f.workspaceRepo.getRole(team.id, "bob")).toBe("editor");
  });

  it("caps members plus pending invitations, but still allows resending", async () => {
    const { f, team } = await setup();
    for (let i = 0; i < LIMITS.workspaceMembersMax - 1; i++) {
      await f.workspaceRepo.saveInvite({
        workspaceId: team.id,
        email: `filler${i}@x.io`,
        role: "viewer",
        tokenHash: `hash-${i}`,
        invitedBy: "alice",
        expiresAt: new Date("2030-01-01"),
      });
    }
    await expect(f.workspaces.invite(users.alice, team.id, "bob@x.io", "viewer")).rejects.toThrow(/at most/);
    await expect(f.workspaces.invite(users.alice, team.id, "filler3@x.io", "editor")).resolves.toBeDefined();
  });

  it("rate limits invitations per person", async () => {
    const { f, team } = await setup();
    for (let i = 0; i < 30; i++) await f.workspaces.invite(users.alice, team.id, `p${i}@x.io`, "viewer");
    await expect(f.workspaces.invite(users.alice, team.id, "p31@x.io", "viewer")).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it("lets managers see and revoke pending invitations; others see none", async () => {
    const { f, team, join, tokenOf } = await setup();
    await join("bob", "viewer");
    const { invite, url } = await f.workspaces.invite(users.alice, team.id, "erin@x.io", "editor");
    expect((await f.workspaces.members(users.alice, team.id)).invites).toHaveLength(1);
    expect((await f.workspaces.members(await f.actAs("bob"), team.id)).invites).toEqual([]);

    await expect(f.workspaces.revokeInvite(await f.actAs("bob"), team.id, invite.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await f.workspaces.revokeInvite(users.alice, team.id, invite.id);
    await expect(f.workspaces.revokeInvite(users.alice, team.id, invite.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(f.workspaces.acceptInvite(await f.actAs("erin"), tokenOf(url))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("accepting an invitation", () => {
  it("adds the member with the invited role and uses the invitation up", async () => {
    const { f, team, tokenOf } = await setup();
    const { url } = await f.workspaces.invite(users.alice, team.id, "bob@x.io", "editor");
    const bob = await f.actAs("bob");
    expect(await f.workspaces.previewInvite(bob, tokenOf(url))).toEqual({
      workspaceName: "Acme",
      role: "editor",
      email: "bob@x.io",
    });
    expect(await f.workspaces.acceptInvite(bob, tokenOf(url))).toEqual({ workspaceId: team.id });
    expect(await f.workspaceRepo.getRole(team.id, "bob")).toBe("editor");
    await expect(f.workspaces.acceptInvite(bob, tokenOf(url))).rejects.toBeInstanceOf(NotFoundError);
    expect((await f.workspaces.listMine(bob)).map((w) => w.name)).toEqual(["Personal", "Acme"]);
  });

  it("only works for the address that was invited", async () => {
    const { f, team, tokenOf } = await setup();
    const { url } = await f.workspaces.invite(users.alice, team.id, "bob@x.io", "editor");
    await expect(f.workspaces.acceptInvite(await f.actAs("carol"), tokenOf(url))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(f.workspaces.previewInvite(await f.actAs("carol"), tokenOf(url))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await f.workspaceRepo.getRole(team.id, "carol")).toBeNull();
  });

  it("expires after the lifetime", async () => {
    const { f, team, tokenOf } = await setup();
    const { url } = await f.workspaces.invite(users.alice, team.id, "bob@x.io", "viewer");
    f.clock.advance(LIMITS.inviteTtlDays * 86_400_000 + 1000);
    await expect(f.workspaces.acceptInvite(await f.actAs("bob"), tokenOf(url))).rejects.toBeInstanceOf(
      GoneError,
    );
    expect(await f.workspaceRepo.getRole(team.id, "bob")).toBeNull();
  });

  it("says the same thing about every unknown token, and needs a signed-in user", async () => {
    const { f } = await setup();
    const bob = await f.actAs("bob");
    for (const token of ["", "short", "x".repeat(40), "x".repeat(500)]) {
      await expect(f.workspaces.acceptInvite(bob, token), token.slice(0, 8)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    }
    await expect(f.workspaces.acceptInvite(users.anon, "x".repeat(40))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("matches the address regardless of case, and finds invitations by token hash only", async () => {
    const { f, team, tokenOf } = await setup();
    const bobRow = f.userRepo.rows.find((u) => u.id === "bob");
    if (bobRow) bobRow.email = "Bob@X.io";
    const { url } = await f.workspaces.invite(users.alice, team.id, "bob@x.io", "viewer");
    expect(await f.workspaceRepo.findInviteByTokenHash(tokenOf(url))).toBeNull();
    expect(await f.workspaceRepo.findInviteByTokenHash(inviteTokenHash(tokenOf(url)))).not.toBeNull();
    await expect(f.workspaces.acceptInvite(await f.actAs("bob"), tokenOf(url))).resolves.toBeDefined();
  });

  it("refuses when the workspace is full, and treats an existing member as done", async () => {
    const { f, team, tokenOf } = await setup();
    const { url } = await f.workspaces.invite(users.alice, team.id, "bob@x.io", "viewer");
    for (let i = 0; i < LIMITS.workspaceMembersMax - 1; i++) {
      f.workspaceRepo.members.push({
        workspaceId: team.id,
        userId: `m${i}`,
        role: "viewer",
        joinedAt: new Date(),
      });
    }
    await expect(f.workspaces.acceptInvite(await f.actAs("bob"), tokenOf(url))).rejects.toThrow(
      /member limit/,
    );

    const second = await setup();
    const sent = await second.f.workspaces.invite(users.alice, second.team.id, "bob@x.io", "editor");
    second.f.workspaceRepo.members.push({
      workspaceId: second.team.id,
      userId: "bob",
      role: "viewer",
      joinedAt: new Date(),
    });
    await second.f.workspaces.acceptInvite(await second.f.actAs("bob"), second.tokenOf(sent.url));
    // Joining twice never raises or lowers an existing role.
    expect(await second.f.workspaceRepo.getRole(second.team.id, "bob")).toBe("viewer");
  });

  it("rate limits attempts", async () => {
    const { f } = await setup();
    const bob = await f.actAs("bob");
    for (let i = 0; i < 20; i++)
      await expect(f.workspaces.acceptInvite(bob, "x".repeat(40))).rejects.toBeInstanceOf(NotFoundError);
    await expect(f.workspaces.acceptInvite(bob, "x".repeat(40))).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("changing roles and removing members", () => {
  it("lets owners change any role and admins only editors and viewers", async () => {
    const { f, team, join, roleOf } = await setup();
    await join("bob", "admin");
    await join("carol", "editor");
    await join("dave", "viewer");
    const bob = await f.actAs("bob");

    await f.workspaces.changeRole(bob, team.id, "carol", "viewer");
    expect(await roleOf("carol")).toBe("viewer");
    await f.workspaces.changeRole(bob, team.id, "dave", "editor");
    expect(await roleOf("dave")).toBe("editor");
    await expect(f.workspaces.changeRole(bob, team.id, "dave", "admin")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(f.workspaces.changeRole(bob, team.id, "alice", "viewer")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(f.workspaces.changeRole(bob, team.id, "bob", "owner")).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    await f.workspaces.changeRole(users.alice, team.id, "bob", "owner");
    expect(await roleOf("bob")).toBe("owner");
  });

  it("stops editors, viewers and outsiders from changing anything", async () => {
    const { f, team, join } = await setup();
    await join("bob", "editor");
    await join("carol", "viewer");
    await expect(
      f.workspaces.changeRole(await f.actAs("bob"), team.id, "carol", "editor"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      f.workspaces.changeRole(await f.actAs("erin"), team.id, "carol", "editor"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(f.workspaces.changeRole(users.alice, team.id, "nobody", "editor")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      f.workspaces.changeRole(users.alice, team.id, "carol", "root" as WorkspaceRole),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("always keeps at least one owner", async () => {
    const { f, team, join, roleOf } = await setup();
    await expect(f.workspaces.changeRole(users.alice, team.id, "alice", "admin")).rejects.toThrow(
      /at least one owner/,
    );
    await expect(f.workspaces.leave(users.alice, team.id)).rejects.toThrow(/only owner/);

    await join("bob", "viewer");
    await f.workspaces.changeRole(users.alice, team.id, "bob", "owner");
    // Now there are two, so one may step down — but not both.
    await f.workspaces.changeRole(await f.actAs("bob", team.id), team.id, "alice", "editor");
    expect(await roleOf("alice")).toBe("editor");
    await expect(f.workspaces.leave(await f.actAs("bob", team.id), team.id)).rejects.toThrow(/only owner/);
    await expect(f.workspaces.removeMember(await f.actAs("bob", team.id), team.id, "bob")).rejects.toThrow(
      /only owner/,
    );
  });

  it("removes members without touching their links, and cuts off their access at once", async () => {
    const { f, team, join } = await setup();
    const bob = await join("bob", "editor");
    const { link } = await f.links.create(bob, { destinationUrl: "https://bobs.example" }, { ip: null });
    expect(link.ownerId).toBe("bob");

    await f.workspaces.removeMember(users.alice, team.id, "bob");
    expect(await f.workspaceRepo.getRole(team.id, "bob")).toBeNull();
    // The link is still there for the team, and Bob no longer reaches it.
    const aliceInTeam = await f.actAs("alice", team.id);
    expect((await f.links.get(aliceInTeam, link.id)).destinationUrl).toBe("https://bobs.example");
    await expect(f.links.get(await f.actAs("bob", team.id), link.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("limits who can remove whom", async () => {
    const { f, team, join } = await setup();
    await join("bob", "admin");
    await join("carol", "admin");
    await join("dave", "editor");
    const bob = await f.actAs("bob");
    await expect(f.workspaces.removeMember(bob, team.id, "carol")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(f.workspaces.removeMember(bob, team.id, "alice")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(f.workspaces.removeMember(await f.actAs("dave"), team.id, "carol")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await f.workspaces.removeMember(bob, team.id, "dave");
    expect(await f.workspaceRepo.getRole(team.id, "dave")).toBeNull();
    await expect(f.workspaces.removeMember(bob, team.id, "dave")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lets anyone leave a team, but not their personal workspace or one they are not in", async () => {
    const { f, team, join } = await setup();
    await join("bob", "viewer");
    await f.workspaces.leave(await f.actAs("bob"), team.id);
    expect(await f.workspaceRepo.getRole(team.id, "bob")).toBeNull();
    await expect(f.workspaces.leave(await f.actAs("bob"), team.id)).rejects.toBeInstanceOf(NotFoundError);
    const personal = await personalOf(f);
    await expect(f.workspaces.leave(users.alice, personal.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("treats removing yourself as leaving", async () => {
    const { f, team, join } = await setup();
    await join("bob", "editor");
    await f.workspaces.removeMember(await f.actAs("bob"), team.id, "bob");
    expect(await f.workspaceRepo.getRole(team.id, "bob")).toBeNull();
  });
});

describe("members list", () => {
  it("shows everyone to members and nothing to outsiders", async () => {
    const { f, team, join } = await setup();
    await join("bob", "viewer");
    const view = await f.workspaces.members(await f.actAs("bob"), team.id);
    expect(view.workspace).toMatchObject({ name: "Acme", role: "viewer", memberCount: 2 });
    expect(view.members.map((m) => [m.email, m.role])).toEqual([
      ["alice@x.io", "owner"],
      ["bob@x.io", "viewer"],
    ]);
    await expect(f.workspaces.members(await f.actAs("erin"), team.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(f.workspaces.members(users.alice, "no-such-workspace")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("links in a shared workspace", () => {
  it("shows a team's links to its members only", async () => {
    const { f, team, join } = await setup();
    const bob = await join("bob", "editor");
    const aliceInTeam = await f.actAs("alice", team.id);
    await f.links.create(
      aliceInTeam,
      { destinationUrl: "https://team.example", customCode: "team-link" },
      { ip: null },
    );
    await f.links.create(
      users.alice,
      { destinationUrl: "https://mine.example", customCode: "alice-only" },
      { ip: null },
    );

    const seenByBob = await f.links.list(bob, {});
    expect(seenByBob.items.map((l) => l.code)).toEqual(["team-link"]);
    // Alice's personal view does not include the team's links, and vice versa.
    expect((await f.links.list(users.alice, {})).items.map((l) => l.code)).toEqual(["alice-only"]);
    expect((await f.links.list(await f.actAs("bob"), {})).items).toEqual([]);
    expect(await f.links.listTags(bob)).toEqual([]);
  });

  it("gives each role the right abilities on a shared link", async () => {
    const { f, team, join } = await setup();
    await join("bob", "editor");
    await join("carol", "viewer");
    await join("dave", "admin");
    const created = await f.links.create(
      await f.actAs("alice", team.id),
      { destinationUrl: "https://team.example", customCode: "shared-1" },
      { ip: null },
    );
    const id = created.link.id;
    const editor = await f.actAs("bob", team.id);
    const viewer = await f.actAs("carol", team.id);
    const admin = await f.actAs("dave", team.id);

    for (const actor of [editor, viewer, admin]) expect((await f.links.get(actor, id)).code).toBe("shared-1");
    expect((await f.links.update(editor, id, { title: "By editor" })).title).toBe("By editor");
    expect((await f.links.update(admin, id, { title: "By admin" })).title).toBe("By admin");

    await expect(f.links.update(viewer, id, { title: "Nope" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(f.links.delete(viewer, [id])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(f.links.setEnabled(viewer, [id], false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      f.links.create(viewer, { destinationUrl: "https://viewer.example" }, { ip: null }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      f.links.importLinks(viewer, [{ row: 1, destinationUrl: "https://v.example" }]),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await f.links.delete(editor, [id])).toBe(1);
  });

  it("lets viewers read analytics and QR codes but not change anything", async () => {
    const { f, team, join } = await setup();
    await join("carol", "viewer");
    const created = await f.links.create(
      await f.actAs("alice", team.id),
      { destinationUrl: "https://team.example", customCode: "stats-1" },
      { ip: null },
    );
    const viewer = await f.actAs("carol", team.id);
    await expect(f.qr.forOwnedLink(viewer, created.link.id, "svg")).resolves.toBeDefined();
    await expect(
      f.analytics.getLinkAnalytics(viewer, created.link.id, { range: "7d", includeBots: false }),
    ).resolves.toBeDefined();
  });

  it("keeps one workspace's links out of reach from another, including your own personal one", async () => {
    const { f, team } = await setup();
    const inTeam = await f.links.create(
      await f.actAs("alice", team.id),
      { destinationUrl: "https://team.example", customCode: "walled" },
      { ip: null },
    );
    // Alice owns the workspace, but while showing her personal space the link is out of reach.
    await expect(f.links.get(users.alice, inTeam.link.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(f.links.get(users.bob, inTeam.link.id)).rejects.toBeInstanceOf(ForbiddenError);
    // Instance admins can still reach everything.
    expect((await f.links.get(users.admin, inTeam.link.id)).code).toBe("walled");
  });

  it("claims anonymous links into the workspace being shown", async () => {
    const { f, team } = await setup({ allowAnonymousLinks: true });
    const { link, claimToken } = await f.links.create(
      users.anon,
      { destinationUrl: "https://anon.example" },
      { ip: "1.2.3.4" },
    );
    expect(claimToken).not.toBeNull();
    const inTeam = await f.actAs("alice", team.id);
    expect(await f.links.claim(inTeam, [claimToken ?? ""])).toBe(1);
    expect((await f.links.list(inTeam, {})).items.map((l) => l.id)).toEqual([link.id]);
    expect((await f.links.list(users.alice, {})).items).toEqual([]);
  });

  it("scopes the import preview and re-imports to the workspace", async () => {
    const { f, team } = await setup();
    const inTeam = await f.actAs("alice", team.id);
    await f.links.importLinks(inTeam, [
      { row: 1, destinationUrl: "https://a.example", customCode: "imp-code" },
    ]);
    expect(
      await f.links.checkImportCodes(inTeam, [{ code: "imp-code", destinationUrl: "https://a.example" }]),
    ).toEqual({
      taken: [],
      existing: ["imp-code"],
    });
    // The same code is "taken" from the point of view of a different workspace.
    expect(
      await f.links.checkImportCodes(users.alice, [
        { code: "imp-code", destinationUrl: "https://a.example" },
      ]),
    ).toEqual({
      taken: ["imp-code"],
      existing: [],
    });
    const again = await f.links.importLinks(inTeam, [
      { row: 1, destinationUrl: "https://a.example", customCode: "imp-code" },
    ]);
    expect(again[0]).toMatchObject({ status: "skipped" });
  });
});

describe("bio buttons stay personal", () => {
  it("are created in the personal workspace and managed by their creator from any workspace", async () => {
    const { f, team } = await setup();
    const inTeam = await f.actAs("alice", team.id);
    await f.bio.saveProfile(users.alice, {
      handle: "alice",
      displayName: "Alice",
      bio: null,
      avatarUrl: null,
      theme: "paper",
      socials: [],
      showBadge: true,
      isPublished: true,
    });
    const button = await f.bio.addButton(inTeam, { label: "Shop", url: "https://shop.example" });
    const stored = f.linkRepo.rows.get(button.link.id);
    expect(stored).toMatchObject({ kind: "bio_button", userId: "alice", workspaceId: "ws-alice" });
    // Editing from the team view still works, because bio pages are personal.
    await expect(f.bio.updateButton(inTeam, button.id, { label: "Store" })).resolves.toBeDefined();
    // Nobody else's workspace reaches it, and it never shows in a team's list.
    await expect(f.links.get(users.bob, button.link.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await f.links.list(inTeam, {})).items).toEqual([]);
  });
});

describe("API keys and workspaces", () => {
  it("act in the workspace they were made in, with the owner's current role there", async () => {
    const { f, team, join } = await setup();
    const bob = await join("bob", "editor");
    const { secret } = await f.apiKeys.create(bob, "ci");
    const principal = await f.apiKeys.authenticate(secret);
    expect(principal?.actor).toMatchObject({ userId: "bob", workspace: { id: team.id, role: "editor" } });

    await f.workspaces.changeRole(users.alice, team.id, "bob", "viewer");
    expect((await f.apiKeys.authenticate(secret))?.actor).toMatchObject({ workspace: { role: "viewer" } });
  });

  it("stop working once their owner has left the workspace", async () => {
    const { f, team, join } = await setup();
    const bob = await join("bob", "editor");
    const { secret } = await f.apiKeys.create(bob, "ci");
    await f.workspaces.removeMember(users.alice, team.id, "bob");
    expect(await f.apiKeys.authenticate(secret)).toBeNull();
  });

  it("are listed per workspace", async () => {
    const { f, team, join } = await setup();
    const bob = await join("bob", "editor");
    await f.apiKeys.create(bob, "team key");
    await f.apiKeys.create(await f.actAs("bob"), "personal key");
    expect((await f.apiKeys.list(bob)).map((k) => k.name)).toEqual(["team key"]);
    expect((await f.apiKeys.list(await f.actAs("bob"))).map((k) => k.name)).toEqual(["personal key"]);
    void team;
  });
});

describe("account deletion", () => {
  it("is blocked while you are the only owner of a team that has other members", async () => {
    const { f, team, join } = await setup();
    await join("bob", "editor");
    await expect(f.workspaces.prepareAccountDeletion("alice")).rejects.toThrow(/"Acme"/);
    expect(await f.workspaceRepo.findById(team.id)).not.toBeNull();

    await f.workspaces.changeRole(users.alice, team.id, "bob", "owner");
    await expect(f.workspaces.prepareAccountDeletion("alice")).resolves.toBeUndefined();
    expect(await f.workspaceRepo.findById(team.id)).not.toBeNull();
  });

  it("removes teams only you belong to, and leaves everyone else's alone", async () => {
    const { f, team } = await setup();
    const solo = await f.workspaces.create(users.bob, "Bob alone");
    await f.workspaces.prepareAccountDeletion("alice");
    expect(await f.workspaceRepo.findById(team.id)).toBeNull();
    expect(await f.workspaceRepo.findById(solo.id)).not.toBeNull();
  });

  it("lists memberships for the data export", async () => {
    const { f, team, join } = await setup();
    await join("bob", "viewer");
    expect(await f.workspaces.exportMemberships("bob")).toEqual([
      { id: expect.any(String), name: "Personal", personal: true, role: "owner" },
      { id: team.id, name: "Acme", personal: false, role: "viewer" },
    ]);
  });
});
