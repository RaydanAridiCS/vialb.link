import { v7 as uuidv7 } from "uuid";
import type { Folder, FolderWithCount } from "@/server/domain/types";
import { UniqueViolationError } from "@/server/errors";
import type { IFolderRepository } from "@/server/repositories/folder.repository";
import type { InMemoryLinkRepository } from "./link.repository.memory";

export class InMemoryFolderRepository implements IFolderRepository {
  readonly rows = new Map<string, Folder>();

  constructor(
    private readonly linkRepo: InMemoryLinkRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private clash(workspaceId: string, name: string, exceptId?: string) {
    return [...this.rows.values()].some(
      (f) =>
        f.workspaceId === workspaceId && f.id !== exceptId && f.name.toLowerCase() === name.toLowerCase(),
    );
  }

  async list(workspaceId: string): Promise<FolderWithCount[]> {
    return [...this.rows.values()]
      .filter((f) => f.workspaceId === workspaceId)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      .map((f) => ({
        ...f,
        linkCount: [...this.linkRepo.rows.values()].filter(
          (l) => l.folderId === f.id && !l.deletedAt && l.kind === "link",
        ).length,
      }));
  }

  async findById(id: string) {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async findManyByIds(ids: readonly string[]) {
    return ids.flatMap((id) => {
      const row = this.rows.get(id);
      return row ? [{ ...row }] : [];
    });
  }

  async findByName(workspaceId: string, name: string) {
    const row = [...this.rows.values()].find(
      (f) => f.workspaceId === workspaceId && f.name.toLowerCase() === name.toLowerCase(),
    );
    return row ? { ...row } : null;
  }

  async count(workspaceId: string) {
    return [...this.rows.values()].filter((f) => f.workspaceId === workspaceId).length;
  }

  async create(workspaceId: string, name: string): Promise<Folder> {
    if (this.clash(workspaceId, name)) throw new UniqueViolationError("folders_workspace_name_unique");
    const folder = { id: uuidv7(), workspaceId, name, createdAt: this.now() };
    this.rows.set(folder.id, folder);
    return { ...folder };
  }

  async rename(id: string, name: string) {
    const row = this.rows.get(id);
    if (!row) return null;
    if (this.clash(row.workspaceId, name, id))
      throw new UniqueViolationError("folders_workspace_name_unique");
    row.name = name;
    return { ...row };
  }

  async delete(id: string) {
    if (!this.rows.delete(id)) return false;
    for (const link of this.linkRepo.rows.values()) if (link.folderId === id) link.folderId = null;
    return true;
  }
}
