import type { ApiKey } from "@/server/domain/types";

export interface IApiKeyRepository {
  create(input: Pick<ApiKey, "userId" | "workspaceId" | "name" | "prefix" | "hash">): Promise<ApiKey>;
  findActiveByPrefix(prefix: string): Promise<ApiKey | null>;
  /** A user's keys, newest first; only those acting in `workspaceId` when it is given. */
  listByUser(userId: string, workspaceId?: string): Promise<ApiKey[]>;
  revoke(id: string, userId: string, at: Date): Promise<boolean>;
  touch(id: string, at: Date): Promise<void>;
}
