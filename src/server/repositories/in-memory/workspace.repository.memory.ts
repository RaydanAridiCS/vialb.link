import { v7 as uuidv7 } from "uuid";
import type { WorkspaceRole } from "@/lib/permissions";
import type { Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceMembership } from "@/server/domain/types";
import type {
  AcceptResult,
  InviteWithWorkspace,
  IWorkspaceRepository,
  NewInvite,
} from "@/server/repositories/workspace.repository";
import type { IUserRepository } from "@/server/repositories/user.repository";

interface Row extends Workspace {
  personalUserId: string | null;
}

interface MemberRow {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: Date;
}

interface InviteRow extends WorkspaceInvite {
  tokenHash: string;
}

/** In-memory fake for unit tests. Mirrors the Drizzle semantics, not its performance. */
export class InMemoryWorkspaceRepository implements IWorkspaceRepository {
  readonly workspaces = new Map<string, Row>();
  readonly members: MemberRow[] = [];
  readonly invites = new Map<string, InviteRow>();

  constructor(
    private readonly users: IUserRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private view(row: Row): Workspace {
    return { id: row.id, name: row.name, isPersonal: row.personalUserId !== null, createdAt: row.createdAt };
  }

  private owners(workspaceId: string): MemberRow[] {
    return this.members.filter((m) => m.workspaceId === workspaceId && m.role === "owner");
  }

  /** Test helper: gives a user a personal workspace with a known id. */
  seedPersonal(userId: string, id: string): void {
    this.workspaces.set(id, {
      id,
      name: "Personal",
      isPersonal: true,
      personalUserId: userId,
      createdAt: this.now(),
    });
    this.members.push({ workspaceId: id, userId, role: "owner", joinedAt: this.now() });
  }

  async ensurePersonal(userId: string): Promise<Workspace> {
    for (const row of this.workspaces.values()) {
      if (row.personalUserId === userId) return this.view(row);
    }
    const row: Row = {
      id: uuidv7(),
      name: "Personal",
      isPersonal: true,
      personalUserId: userId,
      createdAt: this.now(),
    };
    this.workspaces.set(row.id, row);
    this.members.push({ workspaceId: row.id, userId, role: "owner", joinedAt: this.now() });
    return this.view(row);
  }

  async findById(id: string): Promise<Workspace | null> {
    const row = this.workspaces.get(id);
    return row ? this.view(row) : null;
  }

  async create(input: { name: string; createdBy: string }): Promise<Workspace> {
    const row: Row = {
      id: uuidv7(),
      name: input.name,
      isPersonal: false,
      personalUserId: null,
      createdAt: this.now(),
    };
    this.workspaces.set(row.id, row);
    this.members.push({ workspaceId: row.id, userId: input.createdBy, role: "owner", joinedAt: this.now() });
    return this.view(row);
  }

  async countTeamsOwnedBy(userId: string): Promise<number> {
    return this.members.filter(
      (m) =>
        m.userId === userId &&
        m.role === "owner" &&
        this.workspaces.get(m.workspaceId)?.personalUserId === null,
    ).length;
  }

  async listForUser(userId: string): Promise<WorkspaceMembership[]> {
    return this.members
      .filter((m) => m.userId === userId)
      .flatMap((m) => {
        const row = this.workspaces.get(m.workspaceId);
        if (!row) return [];
        const memberCount = this.members.filter((o) => o.workspaceId === row.id).length;
        return [{ ...this.view(row), role: m.role, memberCount }];
      })
      .sort((a, b) => Number(!a.isPersonal) - Number(!b.isPersonal) || a.name.localeCompare(b.name));
  }

  async getRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
    return this.members.find((m) => m.workspaceId === workspaceId && m.userId === userId)?.role ?? null;
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const result: WorkspaceMember[] = [];
    for (const member of this.members.filter((m) => m.workspaceId === workspaceId)) {
      const user = await this.users.findById(member.userId);
      result.push({
        userId: member.userId,
        name: user?.name ?? member.userId,
        email: user?.email ?? `${member.userId}@example.test`,
        role: member.role,
        joinedAt: member.joinedAt,
      });
    }
    return result;
  }

  async setRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<boolean> {
    const member = this.members.find((m) => m.workspaceId === workspaceId && m.userId === userId);
    if (!member) return false;
    if (member.role === "owner" && role !== "owner" && this.owners(workspaceId).length <= 1) return false;
    member.role = role;
    return true;
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const index = this.members.findIndex((m) => m.workspaceId === workspaceId && m.userId === userId);
    const member = this.members[index];
    if (!member) return false;
    if (member.role === "owner" && this.owners(workspaceId).length <= 1) return false;
    this.members.splice(index, 1);
    return true;
  }

  async rename(id: string, name: string): Promise<Workspace | null> {
    const row = this.workspaces.get(id);
    if (!row) return null;
    row.name = name;
    return this.view(row);
  }

  async delete(id: string): Promise<boolean> {
    if (!this.workspaces.delete(id)) return false;
    for (let i = this.members.length - 1; i >= 0; i--) {
      if (this.members[i]?.workspaceId === id) this.members.splice(i, 1);
    }
    for (const [inviteId, invite] of this.invites) {
      if (invite.workspaceId === id) this.invites.delete(inviteId);
    }
    return true;
  }

  async saveInvite(input: NewInvite): Promise<WorkspaceInvite> {
    const existing = [...this.invites.values()].find(
      (i) => i.workspaceId === input.workspaceId && i.email === input.email,
    );
    const row: InviteRow = {
      id: existing?.id ?? uuidv7(),
      workspaceId: input.workspaceId,
      email: input.email,
      role: input.role,
      tokenHash: input.tokenHash,
      invitedBy: input.invitedBy,
      expiresAt: input.expiresAt,
      createdAt: this.now(),
    };
    this.invites.set(row.id, row);
    return this.publicInvite(row);
  }

  private publicInvite({ tokenHash: _tokenHash, ...invite }: InviteRow): WorkspaceInvite {
    return invite;
  }

  async listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    return [...this.invites.values()]
      .filter((i) => i.workspaceId === workspaceId)
      .map((i) => this.publicInvite(i));
  }

  async findInviteByTokenHash(tokenHash: string): Promise<InviteWithWorkspace | null> {
    const invite = [...this.invites.values()].find((i) => i.tokenHash === tokenHash);
    const workspace = invite ? this.workspaces.get(invite.workspaceId) : undefined;
    return invite && workspace ? { ...this.publicInvite(invite), workspaceName: workspace.name } : null;
  }

  async deleteInvite(id: string, workspaceId: string): Promise<boolean> {
    const invite = this.invites.get(id);
    if (!invite || invite.workspaceId !== workspaceId) return false;
    return this.invites.delete(id);
  }

  async acceptInvite(inviteId: string, userId: string, memberLimit: number): Promise<AcceptResult> {
    const invite = this.invites.get(inviteId);
    if (!invite) return "missing";
    if (this.members.some((m) => m.workspaceId === invite.workspaceId && m.userId === userId)) {
      this.invites.delete(inviteId);
      return "already_member";
    }
    if (this.members.filter((m) => m.workspaceId === invite.workspaceId).length >= memberLimit) return "full";
    this.members.push({ workspaceId: invite.workspaceId, userId, role: invite.role, joinedAt: this.now() });
    this.invites.delete(inviteId);
    return "joined";
  }

  async findStrandedTeams(userId: string): Promise<Workspace[]> {
    return [...this.workspaces.values()]
      .filter((w) => w.personalUserId === null)
      .filter((w) => {
        const owners = this.owners(w.id);
        const others = this.members.filter((m) => m.workspaceId === w.id && m.userId !== userId);
        return owners.length === 1 && owners[0]?.userId === userId && others.length > 0;
      })
      .map((w) => this.view(w));
  }

  async deleteTeamsWhereOnlyMember(userId: string): Promise<number> {
    const doomed = [...this.workspaces.values()].filter((w) => {
      if (w.personalUserId !== null) return false;
      const members = this.members.filter((m) => m.workspaceId === w.id);
      return members.length > 0 && members.every((m) => m.userId === userId);
    });
    for (const w of doomed) await this.delete(w.id);
    return doomed.length;
  }
}
