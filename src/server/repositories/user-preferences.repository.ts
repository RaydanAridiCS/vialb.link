import type { UserPreferences } from "@/server/domain/types";

export interface IUserPreferencesRepository {
  /** Preferences for several people at once; people without a stored row get the defaults (everything on). */
  getMany(userIds: readonly string[]): Promise<Map<string, UserPreferences>>;
  upsert(userId: string, patch: Partial<Omit<UserPreferences, "userId">>): Promise<UserPreferences>;
}

export const DEFAULT_PREFERENCES = { weeklyReport: true, brokenLinksEmail: true } as const;
