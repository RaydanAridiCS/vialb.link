import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { apiKeys } from "@/server/db/schema";
import type { ApiKey } from "@/server/domain/types";
import type { IApiKeyRepository } from "@/server/repositories/api-key.repository";
import { rethrowUniqueViolation } from "./pg-errors";

export class DrizzleApiKeyRepository implements IApiKeyRepository {
  constructor(private readonly db: Database) {}

  async create(input: Pick<ApiKey, "userId" | "name" | "prefix" | "hash">): Promise<ApiKey> {
    try {
      const [row] = await this.db.insert(apiKeys).values(input).returning();
      if (!row) throw new Error("Insert returned no row");
      return row;
    } catch (error) {
      rethrowUniqueViolation(error);
    }
  }

  async findActiveByPrefix(prefix: string): Promise<ApiKey | null> {
    const [row] = await this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.prefix, prefix), isNull(apiKeys.revokedAt)))
      .limit(1);
    return row ?? null;
  }

  async listByUser(userId: string): Promise<ApiKey[]> {
    return this.db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt));
  }

  async revoke(id: string, userId: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(apiKeys)
      .set({ revokedAt: at })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id });
    return rows.length > 0;
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.db.update(apiKeys).set({ lastUsedAt: at }).where(eq(apiKeys.id, id));
  }
}
