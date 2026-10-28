import "server-only";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { folders, links } from "@/server/db/schema";
import type { Folder, FolderWithCount } from "@/server/domain/types";
import type { IFolderRepository } from "@/server/repositories/folder.repository";
import { rethrowUniqueViolation } from "./pg-errors";

export class DrizzleFolderRepository implements IFolderRepository {
  constructor(private readonly db: Database) {}

  async list(workspaceId: string): Promise<FolderWithCount[]> {
    const rows = await this.db
      .select({
        id: folders.id,
        workspaceId: folders.workspaceId,
        name: folders.name,
        createdAt: folders.createdAt,
        linkCount: sql<number>`count(${links.id})::int`,
      })
      .from(folders)
      .leftJoin(links, and(eq(links.folderId, folders.id), isNull(links.deletedAt), eq(links.kind, "link")))
      .where(eq(folders.workspaceId, workspaceId))
      .groupBy(folders.id)
      .orderBy(asc(sql`lower(${folders.name})`));
    return rows.map((row) => ({ ...row, linkCount: Number(row.linkCount) }));
  }

  async findById(id: string): Promise<Folder | null> {
    const [row] = await this.db.select().from(folders).where(eq(folders.id, id)).limit(1);
    return row ?? null;
  }

  async findManyByIds(ids: readonly string[]): Promise<Folder[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(folders)
      .where(inArray(folders.id, [...ids]));
  }

  async findByName(workspaceId: string, name: string): Promise<Folder | null> {
    const [row] = await this.db
      .select()
      .from(folders)
      .where(and(eq(folders.workspaceId, workspaceId), sql`lower(${folders.name}) = lower(${name})`))
      .limit(1);
    return row ?? null;
  }

  async count(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(folders)
      .where(eq(folders.workspaceId, workspaceId));
    return row?.total ?? 0;
  }

  async create(workspaceId: string, name: string): Promise<Folder> {
    try {
      const [row] = await this.db.insert(folders).values({ workspaceId, name }).returning();
      if (!row) throw new Error("Folder insert returned no row");
      return row;
    } catch (error) {
      return rethrowUniqueViolation(error);
    }
  }

  async rename(id: string, name: string): Promise<Folder | null> {
    try {
      const [row] = await this.db.update(folders).set({ name }).where(eq(folders.id, id)).returning();
      return row ?? null;
    } catch (error) {
      return rethrowUniqueViolation(error);
    }
  }

  async delete(id: string): Promise<boolean> {
    const removed = await this.db.delete(folders).where(eq(folders.id, id)).returning({ id: folders.id });
    return removed.length === 1;
  }
}
