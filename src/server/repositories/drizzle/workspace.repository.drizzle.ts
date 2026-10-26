import "server-only";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import type { WorkspaceRole } from "@/lib/permissions";
import type { Database } from "@/server/db/client";
import { user, workspaceInvites, workspaceMembers, workspaces } from "@/server/db/schema";
import type { Workspace, WorkspaceInvite, WorkspaceMember, WorkspaceMembership } from "@/server/domain/types";
import type {
  AcceptResult,
  InviteWithWorkspace,
  IWorkspaceRepository,
  NewInvite,
} from "@/server/repositories/workspace.repository";

type WorkspaceRow = typeof workspaces.$inferSelect;
type InviteRow = typeof workspaceInvites.$inferSelect;

const PERSONAL_NAME = "Personal";

function toWorkspace(row: WorkspaceRow): Workspace {
  return { id: row.id, name: row.name, isPersonal: row.personalUserId !== null, createdAt: row.createdAt };
}

function toInvite(row: InviteRow): WorkspaceInvite {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role,
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export class DrizzleWorkspaceRepository implements IWorkspaceRepository {
  constructor(private readonly db: Database) {}

  async ensurePersonal(userId: string): Promise<Workspace> {
    const find = async () => {
      const [row] = await this.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.personalUserId, userId))
        .limit(1);
      return row ?? null;
    };
    const existing = await find();
    if (existing) return toWorkspace(existing);

    // Two first requests can race; the unique column makes one insert a no-op and both end up with the same row.
    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(workspaces)
        .values({ name: PERSONAL_NAME, personalUserId: userId, createdBy: userId })
        .onConflictDoNothing({ target: workspaces.personalUserId })
        .returning();
      if (row) {
        await tx.insert(workspaceMembers).values({ workspaceId: row.id, userId, role: "owner" });
      }
      return row ?? null;
    });
    const row = created ?? (await find());
    if (!row) throw new Error("Could not create the personal workspace");
    return toWorkspace(row);
  }

  async findById(id: string): Promise<Workspace | null> {
    const [row] = await this.db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return row ? toWorkspace(row) : null;
  }

  async create(input: { name: string; createdBy: string }): Promise<Workspace> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(workspaces)
        .values({ name: input.name, createdBy: input.createdBy })
        .returning();
      if (!row) throw new Error("Insert returned no row");
      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: row.id, userId: input.createdBy, role: "owner" });
      return toWorkspace(row);
    });
  }

  async countTeamsOwnedBy(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.role, "owner"),
          isNull(workspaces.personalUserId),
        ),
      );
    return row?.total ?? 0;
  }

  async listForUser(userId: string): Promise<WorkspaceMembership[]> {
    const rows = await this.db
      .select({
        workspace: workspaces,
        role: workspaceMembers.role,
        memberCount: sql<number>`(select count(*)::int from workspace_members m where m.workspace_id = ${workspaces.id})`,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(sql`${workspaces.personalUserId} is null`, asc(workspaces.name), asc(workspaces.id));
    return rows.map((row) => ({
      ...toWorkspace(row.workspace),
      role: row.role,
      memberCount: row.memberCount,
    }));
  }

  async getRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
    const [row] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1);
    return row?.role ?? null;
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const rows = await this.db
      .select({
        userId: workspaceMembers.userId,
        name: user.name,
        email: user.email,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.createdAt,
      })
      .from(workspaceMembers)
      .innerJoin(user, eq(user.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(asc(workspaceMembers.createdAt), asc(user.email));
    return rows;
  }

  async setRole(workspaceId: string, userId: string, role: WorkspaceRole): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // Owner changes are serialised per workspace, so "at least one owner" holds under concurrency.
      await tx.execute(sql`select id from workspaces where id = ${workspaceId} for update`);
      const [current] = await tx
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
      if (!current) return false;
      if (current.role === "owner" && role !== "owner" && (await this.ownerCount(tx, workspaceId)) <= 1) {
        return false;
      }
      await tx
        .update(workspaceMembers)
        .set({ role })
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
      return true;
    });
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select id from workspaces where id = ${workspaceId} for update`);
      const [current] = await tx
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
      if (!current) return false;
      if (current.role === "owner" && (await this.ownerCount(tx, workspaceId)) <= 1) return false;
      await tx
        .delete(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
      return true;
    });
  }

  async rename(id: string, name: string): Promise<Workspace | null> {
    const [row] = await this.db.update(workspaces).set({ name }).where(eq(workspaces.id, id)).returning();
    return row ? toWorkspace(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(workspaces)
      .where(eq(workspaces.id, id))
      .returning({ id: workspaces.id });
    return rows.length > 0;
  }

  async saveInvite(input: NewInvite): Promise<WorkspaceInvite> {
    const [row] = await this.db
      .insert(workspaceInvites)
      .values(input)
      .onConflictDoUpdate({
        target: [workspaceInvites.workspaceId, workspaceInvites.email],
        set: {
          role: input.role,
          tokenHash: input.tokenHash,
          invitedBy: input.invitedBy,
          expiresAt: input.expiresAt,
          createdAt: new Date(),
        },
      })
      .returning();
    if (!row) throw new Error("Upsert returned no row");
    return toInvite(row);
  }

  async listInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
    const rows = await this.db
      .select()
      .from(workspaceInvites)
      .where(eq(workspaceInvites.workspaceId, workspaceId))
      .orderBy(asc(workspaceInvites.createdAt));
    return rows.map(toInvite);
  }

  async findInviteByTokenHash(tokenHash: string): Promise<InviteWithWorkspace | null> {
    const [row] = await this.db
      .select({ invite: workspaceInvites, workspaceName: workspaces.name })
      .from(workspaceInvites)
      .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
      .where(eq(workspaceInvites.tokenHash, tokenHash))
      .limit(1);
    return row ? { ...toInvite(row.invite), workspaceName: row.workspaceName } : null;
  }

  async deleteInvite(id: string, workspaceId: string): Promise<boolean> {
    const rows = await this.db
      .delete(workspaceInvites)
      .where(and(eq(workspaceInvites.id, id), eq(workspaceInvites.workspaceId, workspaceId)))
      .returning({ id: workspaceInvites.id });
    return rows.length > 0;
  }

  async acceptInvite(inviteId: string, userId: string, memberLimit: number): Promise<AcceptResult> {
    return this.db.transaction(async (tx) => {
      const [invite] = await tx.select().from(workspaceInvites).where(eq(workspaceInvites.id, inviteId));
      if (!invite) return "missing";
      await tx.execute(sql`select id from workspaces where id = ${invite.workspaceId} for update`);

      const [existing] = await tx
        .select({ role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, userId)),
        );
      if (existing) {
        await tx.delete(workspaceInvites).where(eq(workspaceInvites.id, inviteId));
        return "already_member";
      }
      const [members] = await tx
        .select({ total: count() })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, invite.workspaceId));
      if ((members?.total ?? 0) >= memberLimit) return "full";

      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: invite.workspaceId, userId, role: invite.role });
      await tx.delete(workspaceInvites).where(eq(workspaceInvites.id, inviteId));
      return "joined";
    });
  }

  async findStrandedTeams(userId: string): Promise<Workspace[]> {
    const rows = await this.db
      .select({ workspace: workspaces })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.role, "owner"),
          isNull(workspaces.personalUserId),
          // The only owner, and somebody else is a member too.
          sql`not exists (select 1 from workspace_members o where o.workspace_id = ${workspaces.id} and o.role = 'owner' and o.user_id <> ${userId})`,
          sql`exists (select 1 from workspace_members m where m.workspace_id = ${workspaces.id} and m.user_id <> ${userId})`,
        ),
      );
    return rows.map((row) => toWorkspace(row.workspace));
  }

  async deleteTeamsWhereOnlyMember(userId: string): Promise<number> {
    const rows = await this.db
      .delete(workspaces)
      .where(
        and(
          isNull(workspaces.personalUserId),
          sql`exists (select 1 from workspace_members m where m.workspace_id = ${workspaces.id} and m.user_id = ${userId})`,
          sql`not exists (select 1 from workspace_members m where m.workspace_id = ${workspaces.id} and m.user_id <> ${userId})`,
        ),
      )
      .returning({ id: workspaces.id });
    return rows.length;
  }

  private async ownerCount(tx: Pick<Database, "select">, workspaceId: string): Promise<number> {
    const [row] = await tx
      .select({ total: count() })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")));
    return row?.total ?? 0;
  }
}
