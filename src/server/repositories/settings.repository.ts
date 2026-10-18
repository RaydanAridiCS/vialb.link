import type { InstanceSettingsOverride } from "@/server/domain/types";

export interface ISettingsRepository {
  get(): Promise<InstanceSettingsOverride | null>;
  upsert(patch: Partial<InstanceSettingsOverride>): Promise<InstanceSettingsOverride>;
  /** Returns the salt for a UTC day (`YYYY-MM-DD`), creating it on first use. */
  getOrCreateDailySalt(day: string, candidate: string): Promise<string>;
}
