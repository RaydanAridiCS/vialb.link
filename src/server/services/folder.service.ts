import { LIMITS } from "@/lib/constants";
import { folderNameProblem, normalizeFolderName } from "@/lib/folders";
import type { Actor, Folder, FolderWithCount } from "@/server/domain/types";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UniqueViolationError,
  ValidationError,
} from "@/server/errors";
import type { IFolderRepository } from "@/server/repositories/folder.repository";
import { requireLinkWriter, requireUser } from "./authorization";

export interface FolderServiceDeps {
  folders: IFolderRepository;
}

/**
 * Folders group a workspace's links, one folder per link. Anyone in the workspace can see them; creating,
 * renaming and deleting needs the same role as editing links (editor and above). A folder only ever
 * belongs to the workspace the actor is acting in.
 */
export class FolderService {
  constructor(private readonly deps: FolderServiceDeps) {}

  async list(actor: Actor): Promise<FolderWithCount[]> {
    const user = requireUser(actor);
    return this.deps.folders.list(user.workspace.id);
  }

  async create(actor: Actor, rawName: string): Promise<Folder> {
    const user = requireLinkWriter(actor);
    const name = this.cleanName(rawName);
    if ((await this.deps.folders.count(user.workspace.id)) >= LIMITS.foldersPerWorkspaceMax) {
      throw new ValidationError(`A workspace can have at most ${LIMITS.foldersPerWorkspaceMax} folders`, {
        field: "name",
      });
    }
    try {
      return await this.deps.folders.create(user.workspace.id, name);
    } catch (error) {
      if (error instanceof UniqueViolationError)
        throw new ConflictError("A folder with this name already exists", { field: "name" });
      throw error;
    }
  }

  async rename(actor: Actor, id: string, rawName: string): Promise<Folder> {
    const folder = await this.owned(actor, id);
    const name = this.cleanName(rawName);
    try {
      const renamed = await this.deps.folders.rename(folder.id, name);
      if (!renamed) throw new NotFoundError("Folder not found");
      return renamed;
    } catch (error) {
      if (error instanceof UniqueViolationError)
        throw new ConflictError("A folder with this name already exists", { field: "name" });
      throw error;
    }
  }

  /** Deletes the folder only; its links stay and end up in no folder. */
  async delete(actor: Actor, id: string): Promise<void> {
    const folder = await this.owned(actor, id);
    await this.deps.folders.delete(folder.id);
  }

  /** A folder the actor may change: in their active workspace (instance admins: anywhere). */
  private async owned(actor: Actor, id: string): Promise<Folder> {
    const user = requireLinkWriter(actor);
    const folder = await this.deps.folders.findById(id);
    if (!folder) throw new NotFoundError("Folder not found");
    if (folder.workspaceId !== user.workspace.id && user.role !== "admin") {
      throw new ForbiddenError("You do not have access to this folder");
    }
    return folder;
  }

  private cleanName(raw: string): string {
    const name = normalizeFolderName(raw);
    const problem = folderNameProblem(name);
    if (problem || name === null)
      throw new ValidationError(problem ?? "Give the folder a name", { field: "name" });
    return name;
  }
}
