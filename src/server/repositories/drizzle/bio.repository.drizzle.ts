import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { bioButtons, bioProfiles } from "@/server/db/schema";
import type { BioButton, BioProfile, NewBioButton, NewBioProfile } from "@/server/domain/types";
import type { IBioRepository } from "@/server/repositories/bio.repository";
import { rethrowUniqueViolation } from "./pg-errors";

export class DrizzleBioRepository implements IBioRepository {
  constructor(private readonly db: Database) {}

  async findProfileByUserId(userId: string): Promise<BioProfile | null> {
    const [row] = await this.db.select().from(bioProfiles).where(eq(bioProfiles.userId, userId)).limit(1);
    return row ?? null;
  }

  async findProfileByHandle(handle: string): Promise<BioProfile | null> {
    const [row] = await this.db.select().from(bioProfiles).where(eq(bioProfiles.handle, handle)).limit(1);
    return row ?? null;
  }

  async saveProfile(profile: NewBioProfile): Promise<BioProfile> {
    const { userId: _userId, ...rest } = profile;
    try {
      const [row] = await this.db
        .insert(bioProfiles)
        .values(profile)
        .onConflictDoUpdate({ target: bioProfiles.userId, set: { ...rest, updatedAt: new Date() } })
        .returning();
      if (!row) throw new Error("Upsert returned no row");
      return row;
    } catch (error) {
      rethrowUniqueViolation(error);
    }
  }

  async deleteProfile(userId: string): Promise<BioButton[]> {
    return this.db.transaction(async (tx) => {
      const removed = await tx.delete(bioButtons).where(eq(bioButtons.userId, userId)).returning();
      await tx.delete(bioProfiles).where(eq(bioProfiles.userId, userId));
      return removed;
    });
  }

  async listButtons(userId: string): Promise<BioButton[]> {
    return this.db
      .select()
      .from(bioButtons)
      .where(eq(bioButtons.userId, userId))
      .orderBy(asc(bioButtons.position), asc(bioButtons.id));
  }

  async findButton(id: string): Promise<BioButton | null> {
    const [row] = await this.db.select().from(bioButtons).where(eq(bioButtons.id, id)).limit(1);
    return row ?? null;
  }

  async addButton(input: NewBioButton): Promise<BioButton> {
    const [row] = await this.db
      .insert(bioButtons)
      .values({
        ...input,
        position: sql`(select coalesce(max(${bioButtons.position}), -1) + 1 from ${bioButtons} where ${bioButtons.userId} = ${input.userId})`,
      })
      .returning();
    if (!row) throw new Error("Insert returned no row");
    return row;
  }

  async updateButton(
    id: string,
    patch: Partial<Pick<BioButton, "label" | "isVisible">>,
  ): Promise<BioButton | null> {
    if (Object.keys(patch).length === 0) return this.findButton(id);
    const [row] = await this.db.update(bioButtons).set(patch).where(eq(bioButtons.id, id)).returning();
    return row ?? null;
  }

  async deleteButton(id: string): Promise<void> {
    await this.db.delete(bioButtons).where(eq(bioButtons.id, id));
  }

  async reorderButtons(userId: string, orderedIds: readonly string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [position, id] of orderedIds.entries()) {
        await tx
          .update(bioButtons)
          .set({ position })
          .where(and(eq(bioButtons.id, id), eq(bioButtons.userId, userId)));
      }
    });
  }
}
