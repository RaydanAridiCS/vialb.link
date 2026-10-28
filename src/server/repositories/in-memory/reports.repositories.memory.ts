import type { UserPreferences } from "@/server/domain/types";
import type { DeliveryKey, IEmailDeliveryRepository } from "@/server/repositories/email-delivery.repository";
import {
  DEFAULT_PREFERENCES,
  type IUserPreferencesRepository,
} from "@/server/repositories/user-preferences.repository";

export class InMemoryUserPreferencesRepository implements IUserPreferencesRepository {
  readonly rows = new Map<string, UserPreferences>();

  async getMany(userIds: readonly string[]): Promise<Map<string, UserPreferences>> {
    return new Map(
      userIds.map((id) => [id, { ...(this.rows.get(id) ?? { userId: id, ...DEFAULT_PREFERENCES }) }]),
    );
  }

  async upsert(userId: string, patch: Partial<Omit<UserPreferences, "userId">>): Promise<UserPreferences> {
    const next = { userId, ...DEFAULT_PREFERENCES, ...this.rows.get(userId), ...patch };
    this.rows.set(userId, next);
    return { ...next };
  }
}

const keyOf = (k: DeliveryKey) => `${k.kind}|${k.workspaceId}|${k.userId}|${k.periodKey}`;

export class InMemoryEmailDeliveryRepository implements IEmailDeliveryRepository {
  readonly rows = new Map<string, { claimedAt: Date; sentAt: Date | null }>();

  async claim(key: DeliveryKey, now: Date, staleBefore: Date): Promise<boolean> {
    const existing = this.rows.get(keyOf(key));
    if (existing && (existing.sentAt !== null || existing.claimedAt >= staleBefore)) return false;
    this.rows.set(keyOf(key), { claimedAt: now, sentAt: null });
    return true;
  }

  async markSent(key: DeliveryKey, at: Date): Promise<void> {
    const row = this.rows.get(keyOf(key));
    if (row) row.sentAt = at;
  }

  async release(key: DeliveryKey): Promise<void> {
    const row = this.rows.get(keyOf(key));
    if (row && row.sentAt === null) this.rows.delete(keyOf(key));
  }
}
