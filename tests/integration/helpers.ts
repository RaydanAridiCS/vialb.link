import { sql as rawSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inject } from "vitest";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { DrizzleWorkspaceRepository } from "@/server/repositories/drizzle/workspace.repository.drizzle";

export function connect(): { db: Database; close: () => Promise<void> } {
  const client = postgres(inject("databaseUrl"), { max: 20, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end({ timeout: 5 }) };
}

/** Wipes all application data between tests (keeps the schema). */
export async function truncateAll(db: Database) {
  await db.execute(rawSql`
    truncate table clicks, links, api_keys, daily_salts, instance_settings,
                   workspace_invites, workspace_members, workspaces,
                   two_factor, verification, account, session, "user"
    restart identity cascade
  `);
}

let userSeq = 0;
export async function createUser(db: Database, overrides: Partial<typeof schema.user.$inferInsert> = {}) {
  userSeq += 1;
  const [row] = await db
    .insert(schema.user)
    .values({
      id: `user_${userSeq}_${Date.now()}`,
      name: `User ${userSeq}`,
      email: `user${userSeq}-${Date.now()}@example.com`,
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("user insert failed");
  return row;
}

/** The user's personal workspace id (created on first use, like the app does). */
export async function personalWorkspace(db: Database, userId: string): Promise<string> {
  return (await new DrizzleWorkspaceRepository(db).ensurePersonal(userId)).id;
}
