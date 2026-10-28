import "server-only";
import { and, eq, isNull, lt } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { emailDeliveries } from "@/server/db/schema";
import type { DeliveryKey, IEmailDeliveryRepository } from "@/server/repositories/email-delivery.repository";

function matches(key: DeliveryKey) {
  return and(
    eq(emailDeliveries.kind, key.kind),
    eq(emailDeliveries.workspaceId, key.workspaceId),
    eq(emailDeliveries.userId, key.userId),
    eq(emailDeliveries.periodKey, key.periodKey),
  );
}

export class DrizzleEmailDeliveryRepository implements IEmailDeliveryRepository {
  constructor(private readonly db: Database) {}

  async claim(key: DeliveryKey, now: Date, staleBefore: Date): Promise<boolean> {
    // The primary key makes the insert the lock. A conflicting row is taken over only if its sender gave up
    // (never marked it sent, and claimed it long enough ago).
    const claimed = await this.db
      .insert(emailDeliveries)
      .values({ ...key, claimedAt: now })
      .onConflictDoUpdate({
        target: [
          emailDeliveries.kind,
          emailDeliveries.workspaceId,
          emailDeliveries.userId,
          emailDeliveries.periodKey,
        ],
        set: { claimedAt: now },
        setWhere: and(isNull(emailDeliveries.sentAt), lt(emailDeliveries.claimedAt, staleBefore)),
      })
      .returning({ userId: emailDeliveries.userId });
    return claimed.length === 1;
  }

  async markSent(key: DeliveryKey, at: Date): Promise<void> {
    await this.db.update(emailDeliveries).set({ sentAt: at }).where(matches(key));
  }

  async release(key: DeliveryKey): Promise<void> {
    await this.db.delete(emailDeliveries).where(and(matches(key), isNull(emailDeliveries.sentAt)));
  }
}
