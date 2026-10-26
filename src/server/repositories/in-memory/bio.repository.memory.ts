import { v7 as uuidv7 } from "uuid";
import type { BioButton, BioProfile, NewBioButton, NewBioProfile } from "@/server/domain/types";
import { UniqueViolationError } from "@/server/errors";
import type { IBioRepository } from "@/server/repositories/bio.repository";

/** In-memory fake for unit tests. Mirrors the Drizzle semantics, not its performance. */
export class InMemoryBioRepository implements IBioRepository {
  readonly profiles = new Map<string, BioProfile>();
  readonly buttons = new Map<string, BioButton>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async findProfileByUserId(userId: string): Promise<BioProfile | null> {
    const row = this.profiles.get(userId);
    return row ? { ...row, socials: [...row.socials] } : null;
  }

  async findProfileByHandle(handle: string): Promise<BioProfile | null> {
    for (const row of this.profiles.values()) {
      if (row.handle === handle) return { ...row, socials: [...row.socials] };
    }
    return null;
  }

  async saveProfile(profile: NewBioProfile): Promise<BioProfile> {
    for (const row of this.profiles.values()) {
      if (row.handle === profile.handle && row.userId !== profile.userId) {
        throw new UniqueViolationError("bio_profiles_handle_unique");
      }
    }
    const existing = this.profiles.get(profile.userId);
    const at = this.now();
    const saved: BioProfile = {
      ...profile,
      socials: [...profile.socials],
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
    this.profiles.set(profile.userId, saved);
    return { ...saved, socials: [...saved.socials] };
  }

  async deleteProfile(userId: string): Promise<BioButton[]> {
    const removed = [...this.buttons.values()].filter((b) => b.userId === userId);
    for (const button of removed) this.buttons.delete(button.id);
    this.profiles.delete(userId);
    return removed;
  }

  async listButtons(userId: string): Promise<BioButton[]> {
    return [...this.buttons.values()]
      .filter((b) => b.userId === userId)
      .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
      .map((b) => ({ ...b }));
  }

  async findButton(id: string): Promise<BioButton | null> {
    const row = this.buttons.get(id);
    return row ? { ...row } : null;
  }

  async addButton(input: NewBioButton): Promise<BioButton> {
    const mine = [...this.buttons.values()].filter((b) => b.userId === input.userId);
    const button: BioButton = {
      id: uuidv7(),
      ...input,
      position: mine.reduce((max, b) => Math.max(max, b.position), -1) + 1,
      isVisible: true,
      createdAt: this.now(),
    };
    this.buttons.set(button.id, button);
    return { ...button };
  }

  async updateButton(
    id: string,
    patch: Partial<Pick<BioButton, "label" | "isVisible">>,
  ): Promise<BioButton | null> {
    const row = this.buttons.get(id);
    if (!row) return null;
    Object.assign(row, patch);
    return { ...row };
  }

  async deleteButton(id: string): Promise<void> {
    this.buttons.delete(id);
  }

  async reorderButtons(userId: string, orderedIds: readonly string[]): Promise<void> {
    for (const [position, id] of orderedIds.entries()) {
      const row = this.buttons.get(id);
      if (row?.userId === userId) row.position = position;
    }
  }
}
