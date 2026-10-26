import "server-only";
import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { dailySalts, instanceSettings } from "@/server/db/schema";
import type { InstanceSettingsOverride } from "@/server/domain/types";
import type { ISettingsRepository } from "@/server/repositories/settings.repository";

const SETTINGS_ID = 1;

export class DrizzleSettingsRepository implements ISettingsRepository {
  constructor(private readonly db: Database) {}

  async get(): Promise<InstanceSettingsOverride | null> {
    const [row] = await this.db
      .select({
        allowAnonymousLinks: instanceSettings.allowAnonymousLinks,
        allowSignups: instanceSettings.allowSignups,
        anonLinkTtlHours: instanceSettings.anonLinkTtlHours,
        blockedDomains: instanceSettings.blockedDomains,
        pixelsEnabled: instanceSettings.pixelsEnabled,
      })
      .from(instanceSettings)
      .where(eq(instanceSettings.id, SETTINGS_ID))
      .limit(1);
    return row ?? null;
  }

  async upsert(patch: Partial<InstanceSettingsOverride>): Promise<InstanceSettingsOverride> {
    const [row] = await this.db
      .insert(instanceSettings)
      .values({ id: SETTINGS_ID, ...patch })
      .onConflictDoUpdate({ target: instanceSettings.id, set: { ...patch, updatedAt: new Date() } })
      .returning({
        allowAnonymousLinks: instanceSettings.allowAnonymousLinks,
        allowSignups: instanceSettings.allowSignups,
        anonLinkTtlHours: instanceSettings.anonLinkTtlHours,
        blockedDomains: instanceSettings.blockedDomains,
        pixelsEnabled: instanceSettings.pixelsEnabled,
      });
    if (!row) throw new Error("Upsert returned no row");
    return row;
  }

  async getOrCreateDailySalt(day: string, candidate: string): Promise<string> {
    // Concurrent first requests race on the primary key; the loser re-reads.
    await this.db.insert(dailySalts).values({ day, salt: candidate }).onConflictDoNothing();
    const [row] = await this.db.select().from(dailySalts).where(eq(dailySalts.day, day)).limit(1);
    if (!row) throw new Error(`Daily salt for ${day} missing after insert`);
    return row.salt;
  }
}
