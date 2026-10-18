import postgres from "postgres";

const url = process.env.E2E_DATABASE_URL ?? "postgres://toolwright:toolwright@localhost:5432/toolwright_e2e";

/** Direct DB access for test fixtures that can't be produced through the UI (e.g. past expiry). */
export async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export const E2E_DB_URL = url;
