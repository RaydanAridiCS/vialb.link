import type { ApiKey } from "@/server/domain/types";

export interface IApiKeyRepository {
  create(input: Pick<ApiKey, "userId" | "name" | "prefix" | "hash">): Promise<ApiKey>;
  findActiveByPrefix(prefix: string): Promise<ApiKey | null>;
  listByUser(userId: string): Promise<ApiKey[]>;
  revoke(id: string, userId: string, at: Date): Promise<boolean>;
  touch(id: string, at: Date): Promise<void>;
}
