import { LIMITS, RATE_LIMITS } from "@/lib/constants";
import {
  assignableRoles,
  can,
  canManageMember,
  isWorkspaceRole,
  WORKSPACE_ROLE_LABELS,
  type Permission,
  type WorkspaceRole,
} from "@/lib/permissions";
import { renderWorkspaceInviteEmail } from "@/server/auth/email-templates";
import type {
  Actor,
  Workspace,
  WorkspaceAccess,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceMembership,
} from "@/server/domain/types";
import { ForbiddenError, GoneError, NotFoundError, ValidationError } from "@/server/errors";
import { randomToken, sha256Hex } from "@/server/lib/hashing";
import type { Clock } from "@/server/ports/clock";
import type { Mailer } from "@/server/ports/mailer";
import type { IUserRepository } from "@/server/repositories/user.repository";
import type { IWorkspaceRepository } from "@/server/repositories/workspace.repository";
import type { AbuseService } from "./abuse.service";
import { requireUser } from "./authorization";

export interface WorkspaceServiceDeps {
  workspaces: IWorkspaceRepository;
  users: IUserRepository;
  mailer: Mailer;
  abuse: AbuseService;
  clock: Clock;
  siteUrl: string;
  siteName: string;
}

export interface WorkspaceMembers {
  workspace: WorkspaceMembership;
  members: WorkspaceMember[];
  /** Pending invitations; empty for people who cannot manage members. */
  invites: WorkspaceInvite[];
}

export interface InvitePreview {
  workspaceName: string;
  role: WorkspaceRole;
  email: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Hash of an invitation token, as stored. Exported so tests can mint a token. */
export function inviteTokenHash(token: string): string {
  return sha256Hex(token);
}

/**
 * Teams. Every rule here is checked against the database membership, never against what the caller
 * says about themselves, so a stale cookie or session cannot keep access after someone is removed.
 * Non-members get "not found" rather than "forbidden", so workspace ids cannot be probed.
 */
export class WorkspaceService {
  constructor(private readonly deps: WorkspaceServiceDeps) {}

  /**
   * The workspace a signed-in user acts in: the one they asked for if they belong to it, else their own.
   * Called on every request, so it also creates the personal workspace the first time.
   */
  async resolveAccess(userId: string, preferredId?: string | null): Promise<WorkspaceAccess> {
    const personal = await this.deps.workspaces.ensurePersonal(userId);
    if (preferredId && preferredId !== personal.id) {
      const role = await this.deps.workspaces.getRole(preferredId, userId);
      if (role) return { id: preferredId, role };
    }
    return { id: personal.id, role: "owner" };
  }

  /** The user's personal workspace id (bio buttons live there whatever workspace is showing). */
  async personalWorkspaceId(userId: string): Promise<string> {
    return (await this.deps.workspaces.ensurePersonal(userId)).id;
  }

  async listMine(actor: Actor): Promise<WorkspaceMembership[]> {
    const user = requireUser(actor);
    await this.deps.workspaces.ensurePersonal(user.userId);
    return this.deps.workspaces.listForUser(user.userId);
  }

  async create(actor: Actor, rawName: string): Promise<Workspace> {
    const user = requireUser(actor);
    const name = this.cleanName(rawName);
    if ((await this.deps.workspaces.countTeamsOwnedBy(user.userId)) >= LIMITS.workspacesPerUserMax) {
      throw new ValidationError(`You can own at most ${LIMITS.workspacesPerUserMax} team workspaces`, {
        field: "name",
      });
    }
    await this.deps.abuse.enforceRateLimit(`workspace:create:${user.userId}`, RATE_LIMITS.workspaceCreate);
    return this.deps.workspaces.create({ name, createdBy: user.userId });
  }

  async rename(actor: Actor, workspaceId: string, rawName: string): Promise<Workspace> {
    const { workspace } = await this.requirePermission(actor, workspaceId, "workspace:update");
    this.assertTeam(workspace, "A personal workspace can't be renamed");
    const renamed = await this.deps.workspaces.rename(workspaceId, this.cleanName(rawName));
    if (!renamed) throw new NotFoundError("Workspace not found");
    return renamed;
  }

  /** Deletes a team workspace with all its links and their analytics. Owners only. */
  async delete(actor: Actor, workspaceId: string): Promise<void> {
    const { workspace } = await this.requirePermission(actor, workspaceId, "workspace:delete");
    this.assertTeam(workspace, "A personal workspace can't be deleted. Delete your account instead.");
    await this.deps.workspaces.delete(workspaceId);
  }

  async members(actor: Actor, workspaceId: string): Promise<WorkspaceMembers> {
    const user = requireUser(actor);
    const role = await this.deps.workspaces.getRole(workspaceId, user.userId);
    const workspace = await this.deps.workspaces.findById(workspaceId);
    if (!role || !workspace) throw new NotFoundError("Workspace not found");

    const [members, invites] = await Promise.all([
      this.deps.workspaces.listMembers(workspaceId),
      can(role, "members:manage") ? this.deps.workspaces.listInvites(workspaceId) : Promise.resolve([]),
    ]);
    return { workspace: { ...workspace, role, memberCount: members.length }, members, invites };
  }

  /**
   * Invites someone by email. Returns the link as well as sending it, because instances without SMTP
   * (and addresses that bounce) need a way to hand it over by chat.
   */
  async invite(
    actor: Actor,
    workspaceId: string,
    rawEmail: string,
    role: WorkspaceRole,
  ): Promise<{ invite: WorkspaceInvite; url: string; emailSent: boolean }> {
    const user = requireUser(actor);
    const { workspace, role: actorRole } = await this.requirePermission(actor, workspaceId, "members:manage");
    this.assertTeam(workspace, "Create a team workspace to invite people");
    if (!isWorkspaceRole(role) || !assignableRoles(actorRole).includes(role)) {
      throw new ForbiddenError("You can't invite someone with that role");
    }
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      throw new ValidationError("Enter a valid email address", { field: "email" });
    }
    await this.deps.abuse.enforceRateLimit(`workspace:invite:${user.userId}`, RATE_LIMITS.invite);

    const [members, invites] = await Promise.all([
      this.deps.workspaces.listMembers(workspaceId),
      this.deps.workspaces.listInvites(workspaceId),
    ]);
    if (members.some((member) => member.email.toLowerCase() === email)) {
      throw new ValidationError("That person is already a member", { field: "email" });
    }
    const resend = invites.some((invite) => invite.email === email);
    if (!resend && members.length + invites.length >= LIMITS.workspaceMembersMax) {
      throw new ValidationError(
        `A workspace can have at most ${LIMITS.workspaceMembersMax} members and invitations`,
      );
    }

    const token = randomToken(32);
    const now = this.deps.clock.now();
    const invite = await this.deps.workspaces.saveInvite({
      workspaceId,
      email,
      role,
      tokenHash: inviteTokenHash(token),
      invitedBy: user.userId,
      expiresAt: new Date(now.getTime() + LIMITS.inviteTtlDays * 86_400_000),
    });
    const url = `${this.deps.siteUrl}/invite/${token}`;
    const emailSent = await this.sendInvite(email, url, workspace.name, user.userId, role);
    return { invite, url, emailSent };
  }

  async revokeInvite(actor: Actor, workspaceId: string, inviteId: string): Promise<void> {
    await this.requirePermission(actor, workspaceId, "members:manage");
    if (!(await this.deps.workspaces.deleteInvite(inviteId, workspaceId))) {
      throw new NotFoundError("Invitation not found");
    }
  }

  /** What an invitation link is for, shown before the person accepts. */
  async previewInvite(actor: Actor, token: string): Promise<InvitePreview> {
    const user = requireUser(actor);
    const invite = await this.loadInvite(user.userId, token);
    return { workspaceName: invite.workspaceName, role: invite.role, email: invite.email };
  }

  async acceptInvite(actor: Actor, token: string): Promise<{ workspaceId: string }> {
    const user = requireUser(actor);
    await this.deps.abuse.enforceRateLimit(`workspace:accept:${user.userId}`, RATE_LIMITS.acceptInvite);
    const invite = await this.loadInvite(user.userId, token);
    const result = await this.deps.workspaces.acceptInvite(
      invite.id,
      user.userId,
      LIMITS.workspaceMembersMax,
    );
    if (result === "missing") throw new NotFoundError("This invitation is no longer valid");
    if (result === "full") throw new ValidationError("This workspace has reached its member limit");
    return { workspaceId: invite.workspaceId };
  }

  async changeRole(actor: Actor, workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
    const { role: actorRole } = await this.requirePermission(actor, workspaceId, "members:manage");
    if (!isWorkspaceRole(role)) throw new ValidationError("Unknown role", { field: "role" });
    const targetRole = await this.deps.workspaces.getRole(workspaceId, userId);
    if (!targetRole) throw new NotFoundError("Member not found");
    if (!canManageMember(actorRole, targetRole) || !assignableRoles(actorRole).includes(role)) {
      throw new ForbiddenError("You can't change this member's role");
    }
    if (!(await this.deps.workspaces.setRole(workspaceId, userId, role))) {
      throw new ValidationError("A workspace needs at least one owner");
    }
  }

  /** Removes someone else. Their links stay in the workspace. */
  async removeMember(actor: Actor, workspaceId: string, userId: string): Promise<void> {
    const user = requireUser(actor);
    if (userId === user.userId) return this.leave(actor, workspaceId);
    const { role: actorRole } = await this.requirePermission(actor, workspaceId, "members:manage");
    const targetRole = await this.deps.workspaces.getRole(workspaceId, userId);
    if (!targetRole) throw new NotFoundError("Member not found");
    if (!canManageMember(actorRole, targetRole)) throw new ForbiddenError("You can't remove this member");
    if (!(await this.deps.workspaces.removeMember(workspaceId, userId))) {
      throw new ValidationError("A workspace needs at least one owner");
    }
  }

  async leave(actor: Actor, workspaceId: string): Promise<void> {
    const user = requireUser(actor);
    const workspace = await this.deps.workspaces.findById(workspaceId);
    const role = await this.deps.workspaces.getRole(workspaceId, user.userId);
    if (!workspace || !role) throw new NotFoundError("Workspace not found");
    this.assertTeam(workspace, "You can't leave your personal workspace");
    if (!(await this.deps.workspaces.removeMember(workspaceId, user.userId))) {
      throw new ValidationError(
        "You are the only owner. Make someone else an owner first, or delete the workspace.",
      );
    }
  }

  /**
   * Runs before an account is deleted. Refuses while the person is the only owner of a team that has other
   * members (they would be left without an owner and with data nobody can manage); otherwise removes the
   * teams only they belong to. Their personal workspace goes with the account itself.
   */
  async prepareAccountDeletion(userId: string): Promise<void> {
    const stranded = await this.deps.workspaces.findStrandedTeams(userId);
    if (stranded.length > 0) {
      const names = stranded.map((workspace) => `"${workspace.name}"`).join(", ");
      throw new ValidationError(
        `You are the only owner of ${names}. Make another member an owner, or delete the workspace, before deleting your account.`,
      );
    }
    await this.deps.workspaces.deleteTeamsWhereOnlyMember(userId);
  }

  /** Memberships for the data export. */
  async exportMemberships(
    userId: string,
  ): Promise<{ id: string; name: string; personal: boolean; role: WorkspaceRole }[]> {
    return (await this.deps.workspaces.listForUser(userId)).map((m) => ({
      id: m.id,
      name: m.name,
      personal: m.isPersonal,
      role: m.role,
    }));
  }

  // --- helpers ---------------------------------------------------------------------------------

  private cleanName(raw: string): string {
    const name = raw.trim().replace(/\s+/g, " ");
    if (name.length < 1 || name.length > LIMITS.workspaceNameMax) {
      throw new ValidationError(`Name must be 1-${LIMITS.workspaceNameMax} characters`, { field: "name" });
    }
    return name;
  }

  private assertTeam(workspace: Workspace, message: string) {
    if (workspace.isPersonal) throw new ValidationError(message);
  }

  /** Loads the workspace and the caller's role, requiring membership and the permission. */
  private async requirePermission(actor: Actor, workspaceId: string, permission: Permission) {
    const user = requireUser(actor);
    const [workspace, role] = await Promise.all([
      this.deps.workspaces.findById(workspaceId),
      this.deps.workspaces.getRole(workspaceId, user.userId),
    ]);
    if (!workspace || !role) throw new NotFoundError("Workspace not found");
    if (!can(role, permission)) throw new ForbiddenError("You don't have permission to do that");
    return { workspace, role };
  }

  /** Finds a usable invitation for this person. Every failure says the same thing about unknown tokens. */
  private async loadInvite(userId: string, token: string) {
    if (token.length < 16 || token.length > 128)
      throw new NotFoundError("This invitation is no longer valid");
    const invite = await this.deps.workspaces.findInviteByTokenHash(inviteTokenHash(token));
    if (!invite) throw new NotFoundError("This invitation is no longer valid");
    if (invite.expiresAt.getTime() <= this.deps.clock.now().getTime()) {
      throw new GoneError("expired", "This invitation has expired. Ask for a new one.");
    }
    const user = await this.deps.users.findById(userId);
    if (!user || user.email.toLowerCase() !== invite.email) {
      throw new ForbiddenError(
        "This invitation was sent to a different email address. Sign in with the address it was sent to.",
      );
    }
    return invite;
  }

  private async sendInvite(
    to: string,
    url: string,
    workspaceName: string,
    inviterId: string,
    role: WorkspaceRole,
  ): Promise<boolean> {
    if (!this.deps.mailer.isConfigured) return false;
    const inviter = await this.deps.users.findById(inviterId);
    const { text, html } = renderWorkspaceInviteEmail({
      appName: this.deps.siteName,
      siteUrl: this.deps.siteUrl,
      inviteUrl: url,
      workspaceName,
      inviterName: inviter?.name || inviter?.email || "A teammate",
      roleLabel: WORKSPACE_ROLE_LABELS[role],
      expiresInDays: LIMITS.inviteTtlDays,
    });
    try {
      await this.deps.mailer.send({
        to,
        subject: `${inviter?.name || "A teammate"} invited you to ${workspaceName} on ${this.deps.siteName}`,
        text,
        html,
      });
      return true;
    } catch {
      return false;
    }
  }
}
