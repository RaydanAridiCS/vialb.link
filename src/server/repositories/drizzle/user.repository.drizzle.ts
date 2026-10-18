import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { user } from "@/server/db/schema";
import type { UserSummary } from "@/server/domain/types";
import type { IUserRepository } from "@/server/repositories/user.repository";

const summaryColumns = {
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  banned: user.banned,
};

export class DrizzleUserRepository implements IUserRepository {
  constructor(private readonly db: Database) {}

  async count(): Promise<number> {
    const [row] = await this.db.select({ total: count() }).from(user);
    return row?.total ?? 0;
  }

  async findByEmail(email: string): Promise<UserSummary | null> {
    const [row] = await this.db
      .select(summaryColumns)
      .from(user)
      .where(eq(sql`lower(${user.email})`, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<UserSummary | null> {
    const [row] = await this.db.select(summaryColumns).from(user).where(eq(user.id, id)).limit(1);
    return row ?? null;
  }

  async findFirstAdmin(): Promise<UserSummary | null> {
    const [row] = await this.db
      .select(summaryColumns)
      .from(user)
      .where(eq(user.role, "admin"))
      .orderBy(asc(user.createdAt))
      .limit(1);
    return row ?? null;
  }
}
