import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { E2E_DB_URL } from "./db";

/** Creates (if needed), migrates and wipes the dedicated E2E database. */
export default async function globalSetup() {
  const target = new URL(E2E_DB_URL);
  const dbName = target.pathname.slice(1);
  const admin = new URL(E2E_DB_URL);
  admin.pathname = "/postgres";

  const root = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  const exists = await root`select 1 from pg_database where datname = ${dbName}`;
  if (exists.length === 0) await root.unsafe(`create database "${dbName.replace(/"/g, '""')}"`);
  await root.end();

  const sql = postgres(E2E_DB_URL, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: path.resolve("src/server/db/migrations") });
  await sql.unsafe(`
    truncate table clicks, links, api_keys, daily_salts, instance_settings,
                   two_factor, verification, account, session, "user"
    restart identity cascade
  `);
  await sql.end();
}
