import type { BioButton, BioProfile, NewBioButton, NewBioProfile } from "@/server/domain/types";

export interface IBioRepository {
  findProfileByUserId(userId: string): Promise<BioProfile | null>;
  /** Exact match on the stored (lowercase) handle. */
  findProfileByHandle(handle: string): Promise<BioProfile | null>;
  /** Creates or replaces the user's profile. Throws `UniqueViolationError` when another user has the handle. */
  saveProfile(profile: NewBioProfile): Promise<BioProfile>;
  /** Removes the profile and returns the buttons that went with it (the caller deletes their links). */
  deleteProfile(userId: string): Promise<BioButton[]>;
  /** The user's buttons in display order. */
  listButtons(userId: string): Promise<BioButton[]>;
  findButton(id: string): Promise<BioButton | null>;
  addButton(input: NewBioButton): Promise<BioButton>;
  updateButton(id: string, patch: Partial<Pick<BioButton, "label" | "isVisible">>): Promise<BioButton | null>;
  deleteButton(id: string): Promise<void>;
  /** Rewrites positions so `orderedIds` (all of the user's buttons) appear in that order. */
  reorderButtons(userId: string, orderedIds: readonly string[]): Promise<void>;
}
