import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

declare global {
  var __vialbSql: postgres.Sql | undefined;
}

/**
 * One connection pool per process. In development the pool is cached on
 * globalThis so hot reloads don't leak connections. postgres.js connects
 * lazily, so importing this module never opens a socket by itself.
 */
const sql = globalThis.__vialbSql ?? postgres(env.DATABASE_URL, { max: 10, prepare: true });
if (env.NODE_ENV !== "production") globalThis.__vialbSql = sql;

export const db: Database = drizzle(sql, { schema });
export { sql as pgClient };
