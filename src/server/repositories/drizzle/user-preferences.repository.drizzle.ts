import "server-only";
import { inArray } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { userPreferences } from "@/server/db/schema";
import type { UserPreferences } from "@/server/domain/types";
import {
  DEFAULT_PREFERENCES,
  type IUserPreferencesRepository,
} from "@/server/repositories/user-preferences.repository";

export class DrizzleUserPreferencesRepository implements IUserPreferencesRepository {
  constructor(private readonly db: Database) {}

  async getMany(userIds: readonly string[]): Promise<Map<string, UserPreferences>> {
    const found = new Map<string, UserPreferences>();
    if (userIds.length > 0) {
      const rows = await this.db
        .select()
        .from(userPreferences)
        .where(inArray(userPreferences.userId, [...userIds]));
      for (const row of rows) {
        found.set(row.userId, {
          userId: row.userId,
          weeklyReport: row.weeklyReport,
          brokenLinksEmail: row.brokenLinksEmail,
        });
      }
    }
    return new Map(userIds.map((id) => [id, found.get(id) ?? { userId: id, ...DEFAULT_PREFERENCES }]));
  }

  async upsert(userId: string, patch: Partial<Omit<UserPreferences, "userId">>): Promise<UserPreferences> {
    const [row] = await this.db
      .insert(userPreferences)
      .values({ userId, ...patch })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { ...patch, updatedAt: new Date() } })
      .returning();
    if (!row) throw new Error("Preferences upsert returned no row");
    return { userId: row.userId, weeklyReport: row.weeklyReport, brokenLinksEmail: row.brokenLinksEmail };
  }
}
