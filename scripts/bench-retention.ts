/**
 * Before/after query-cost check for click retention (docs/retention.md).
 *
 * Builds a scratch database, fills it with synthetic clicks, times the analytics queries the app runs,
 * deletes everything older than 90 days with the same batched statement the retention job uses, and times
 * the queries again. Nothing here touches your real data: it creates and drops its own database.
 *
 *   npm run bench:retention            # 3,000,000 clicks
 *   BENCH_CLICKS=500000 npm run bench:retention
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import { DrizzleClickRepository } from "@/server/repositories/drizzle/click.repository.drizzle";

const CLICKS = Number(process.env["BENCH_CLICKS"] ?? 3_000_000);
const LINKS = 200;
const SPAN_DAYS = 400;
const KEEP_DAYS = 90;
const adminUrl = new URL(process.env["DATABASE_URL"] ?? "postgres://vialb:vialb@localhost:5440/vialb");
const benchDb = `vialb_bench_${Date.now()}`;

function urlFor(name: string) {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function median(runs: number, fn: () => Promise<unknown>): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;
}

async function main() {
  const admin = postgres(urlFor("postgres"), { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database "${benchDb}"`);
  const sql = postgres(urlFor(benchDb), { max: 4, onnotice: () => {} });
  try {
    const db = drizzle(sql, { schema }) as unknown as Database;
    await migrate(drizzle(sql), { migrationsFolder: path.join(process.cwd(), "src/server/db/migrations") });

    await sql`insert into "user" (id, name, email) values ('bench', 'Bench', 'bench@example.com')`;
    await sql`insert into workspaces (id, name, personal_user_id) values ('00000000-0000-4000-8000-000000000001', 'Bench', 'bench')`;
    await sql`insert into links (id, code, destination_url, workspace_id)
      select gen_random_uuid(), 'b' || g, 'https://example.com/' || g, '00000000-0000-4000-8000-000000000001'
      from generate_series(1, ${LINKS}) g`;
    console.log(`Inserting ${CLICKS.toLocaleString("en")} clicks…`);
    const started = performance.now();
    await sql`
      insert into clicks (link_id, occurred_at, visitor_hash, country, device_type, referrer_host, is_bot)
      select l.id,
             now() - (random() * ${SPAN_DAYS} * interval '1 day'),
             md5(random()::text),
             (array['US','FR','DE','GB','BR','IN','JP','CA'])[1 + floor(random() * 8)::int],
             (array['desktop','mobile','tablet'])[1 + floor(random() * 3)::int],
             (array['news.example','blog.example','social.example',null])[1 + floor(random() * 4)::int],
             random() < 0.04
      from generate_series(1, ${CLICKS}) g
      join lateral (select id from links offset floor(random() * ${LINKS})::int limit 1) l on true`;
    await sql`vacuum analyze clicks`;
    console.log(`  done in ${((performance.now() - started) / 1000).toFixed(1)}s`);

    const repo = new DrizzleClickRepository(db);
    const [{ id: linkId = "" } = {}] = await sql<
      { id: string }[]
    >`select id from links order by code limit 1`;
    const workspaceId = "00000000-0000-4000-8000-000000000001";
    const to = new Date();
    const from30 = new Date(to.getTime() - 30 * 86_400_000);
    const from7 = new Date(to.getTime() - 7 * 86_400_000);
    const linkFilter = { linkId, from: from30, to, includeBots: false };

    const measure = async () => ({
      "one link: summary, 30 days": await median(3, () => repo.summary(linkFilter)),
      "one link: daily series, 30 days": await median(3, () => repo.timeseries(linkFilter, "day")),
      "one link: top countries, 30 days": await median(3, () => repo.topDimension(linkFilter, "country", 10)),
      "workspace report, 7 days": await median(3, () => repo.workspaceReport(workspaceId, from7, to)),
      "active workspaces, 7 days": await median(3, () => repo.activeWorkspaces(from7, to)),
      "count clicks older than 90 days": await median(3, () =>
        repo.countOlderThan(new Date(to.getTime() - KEEP_DAYS * 86_400_000)),
      ),
    });

    const total = async () => Number((await sql`select count(*)::int as n from clicks`)[0]?.["n"]);
    const rowsBefore = await total();
    const before = await measure();

    const cutoff = new Date(to.getTime() - KEEP_DAYS * 86_400_000);
    console.log("Deleting clicks older than 90 days in batches of 10,000…");
    const deleteStart = performance.now();
    let deleted = 0;
    for (;;) {
      const n = await repo.deleteOlderThan(cutoff, 10_000);
      deleted += n;
      if (n < 10_000) break;
    }
    const deleteSeconds = (performance.now() - deleteStart) / 1000;
    await sql`vacuum analyze clicks`;
    const rowsAfter = await total();
    const after = await measure();

    const sizes = await sql<{ table: string; index: string }[]>`
      select pg_size_pretty(pg_table_size('clicks')) as "table", pg_size_pretty(pg_relation_size('clicks_occurred_brin')) as "index"`;

    const plan = await sql<{ "QUERY PLAN": string }[]>`
      explain select id from clicks where occurred_at < ${new Date(to.getTime() - 500 * 86_400_000).toISOString()}::timestamptz order by occurred_at limit 10000`;

    console.log(
      `\nRows: ${rowsBefore.toLocaleString("en")} before, ${rowsAfter.toLocaleString("en")} after (${deleted.toLocaleString("en")} deleted in ${deleteSeconds.toFixed(1)}s)`,
    );
    console.log(`Table size after: ${sizes[0]?.table}; BRIN index: ${sizes[0]?.index}\n`);
    console.log("| Query (median of 3) | Before (ms) | After (ms) |");
    console.log("| --- | ---: | ---: |");
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      console.log(`| ${key} | ${before[key].toFixed(1)} | ${after[key].toFixed(1)} |`);
    }
    console.log("\nPlan for the cutoff scan:\n" + plan.map((row) => "  " + row["QUERY PLAN"]).join("\n"));
  } finally {
    await sql.end({ timeout: 5 });
    await admin.unsafe(`drop database "${benchDb}" with (force)`);
    await admin.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
