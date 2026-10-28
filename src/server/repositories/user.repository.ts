import type { UserSummary } from "@/server/domain/types";

export interface IUserRepository {
  count(): Promise<number>;
  findByEmail(email: string): Promise<UserSummary | null>;
  findById(id: string): Promise<UserSummary | null>;
  findFirstAdmin(): Promise<UserSummary | null>;
  /** Whether the person signs in with a password (as opposed to only a social login). */
  hasPassword(userId: string): Promise<boolean>;
}
