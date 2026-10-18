/**
 * Applies committed SQL migrations (drizzle-kit generate output).
 *
 * Runs on container start before `server.js`. A Postgres advisory lock makes
 * it safe when several replicas start at once: one migrates, the others wait
 * and then find nothing left to do.
 *
 *   npm run db:migrate                  (local, reads .env)
 *   node dist/migrate.mjs               (Docker, bundled by esbuild)
 */
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const LOCK_KEY = 7_311_942_001; // arbitrary, stable advisory-lock id for Vialb

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const migrationsFolder =
    process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "src/server/db/migrations");

  // A single connection so the advisory lock and the migration share a session.
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    console.log("[migrate] waiting for advisory lock…");
    await sql`select pg_advisory_lock(${LOCK_KEY})`;
    console.log(`[migrate] applying migrations from ${migrationsFolder}`);
    await migrate(drizzle(sql), { migrationsFolder });
    console.log("[migrate] database is up to date");
  } finally {
    await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error("[migrate] failed:", error);
  process.exit(1);
});
