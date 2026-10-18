import "server-only";
import { sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import type { IHealthRepository } from "@/server/repositories/health.repository";

export class DrizzleHealthRepository implements IHealthRepository {
  constructor(private readonly db: Database) {}

  async ping(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }
}
