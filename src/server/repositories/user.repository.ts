import type { UserSummary } from "@/server/domain/types";

export interface IUserRepository {
  count(): Promise<number>;
  findByEmail(email: string): Promise<UserSummary | null>;
  findById(id: string): Promise<UserSummary | null>;
  findFirstAdmin(): Promise<UserSummary | null>;
}
