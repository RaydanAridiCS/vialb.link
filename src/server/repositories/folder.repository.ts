import type { Folder, FolderWithCount } from "@/server/domain/types";

export interface IFolderRepository {
  /** A workspace's folders by name, each with how many live links it holds. */
  list(workspaceId: string): Promise<FolderWithCount[]>;
  findById(id: string): Promise<Folder | null>;
  findManyByIds(ids: readonly string[]): Promise<Folder[]>;
  /** Case-insensitive. */
  findByName(workspaceId: string, name: string): Promise<Folder | null>;
  count(workspaceId: string): Promise<number>;
  /** Throws `UniqueViolationError` when the workspace already has a folder with this name (any case). */
  create(workspaceId: string, name: string): Promise<Folder>;
  /** Throws `UniqueViolationError` on a clash; `null` when the folder does not exist. */
  rename(id: string, name: string): Promise<Folder | null>;
  /** Deletes the folder; its links are kept and end up in no folder. */
  delete(id: string): Promise<boolean>;
}
