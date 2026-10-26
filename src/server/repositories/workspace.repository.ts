import type { WorkspaceRole } from "@/lib/permissions";
import type { Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceMembership } from "@/server/domain/types";

export interface NewInvite {
  workspaceId: string;
  /** Lowercase. */
  email: string;
  role: WorkspaceRole;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
}

export type InviteWithWorkspace = WorkspaceInvite & { workspaceName: string };

export type AcceptResult = "joined" | "already_member" | "full" | "missing";

export interface IWorkspaceRepository {
  /** The user's own workspace, created with its owner membership on first use. Safe to call concurrently. */
  ensurePersonal(userId: string): Promise<Workspace>;
  findById(id: string): Promise<Workspace | null>;
  /** Creates a team workspace and makes `createdBy` its owner, in one step. */
  create(input: { name: string; createdBy: string }): Promise<Workspace>;
  /** Team workspaces the user owns (to cap how many one person can create). */
  countTeamsOwnedBy(userId: string): Promise<number>;
  /** Every workspace the user belongs to: their personal one first, then teams by name. */
  listForUser(userId: string): Promise<WorkspaceMembership[]>;
  getRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  /**
   * Changes a member's role. `false` when they are not a member, or when it would leave the workspace
   * without an owner; checked and applied atomically, so two owners demoting each other cannot both win.
   */
  setRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<boolean>;
  /** Removes a member. `false` when they are not a member or are the last owner. Never touches their links. */
  removeMember(workspaceId: string, userId: string): Promise<boolean>;
  rename(id: string, name: string): Promise<Workspace | null>;
  /** Deletes the workspace and, with it, its links and their analytics. */
  delete(id: string): Promise<boolean>;

  /** Creates the invitation, or replaces the pending one for the same address (resending). */
  saveInvite(input: NewInvite): Promise<WorkspaceInvite>;
  listInvites(workspaceId: string): Promise<WorkspaceInvite[]>;
  findInviteByTokenHash(tokenHash: string): Promise<InviteWithWorkspace | null>;
  deleteInvite(id: string, workspaceId: string): Promise<boolean>;
  /** Turns an invitation into a membership and removes it, atomically. Respects the member cap. */
  acceptInvite(inviteId: string, userId: string, memberLimit: number): Promise<AcceptResult>;

  /** Team workspaces where the user is the only owner but other people are members (they would be stranded). */
  findStrandedTeams(userId: string): Promise<Workspace[]>;
  /** Deletes team workspaces in which the user is the only member. Returns how many. */
  deleteTeamsWhereOnlyMember(userId: string): Promise<number>;
}
