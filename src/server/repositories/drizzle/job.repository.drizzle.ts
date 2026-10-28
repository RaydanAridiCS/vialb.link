import "server-only";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { jobRuns } from "@/server/db/schema";
import type { IJobRepository, JobOutcome, JobState } from "@/server/repositories/job.repository";

export class DrizzleJobRepository implements IJobRepository {
  constructor(private readonly db: Database) {}

  async tryClaim(
    name: string,
    now: Date,
    leaseUntil: Date,
    options: { force?: boolean } = {},
  ): Promise<boolean> {
    await this.db.insert(jobRuns).values({ name, nextRunAt: now }).onConflictDoNothing();
    // One UPDATE decides the winner: only a due, unleased (or lease-expired) row matches.
    const claimed = await this.db
      .update(jobRuns)
      .set({ leaseUntil, lastStartedAt: now })
      .where(
        and(
          eq(jobRuns.name, name),
          options.force ? undefined : lte(jobRuns.nextRunAt, now),
          or(isNull(jobRuns.leaseUntil), lte(jobRuns.leaseUntil, now)),
        ),
      )
      .returning({ name: jobRuns.name });
    return claimed.length === 1;
  }

  async finish(name: string, outcome: JobOutcome): Promise<void> {
    await this.db
      .update(jobRuns)
      .set({
        leaseUntil: null,
        nextRunAt: outcome.nextRunAt,
        lastFinishedAt: outcome.at,
        lastStatus: outcome.status,
        lastError: outcome.error ?? null,
        lastSummary: outcome.summary ?? null,
      })
      .where(eq(jobRuns.name, name));
  }

  async list(): Promise<JobState[]> {
    const rows = await this.db.select().from(jobRuns).orderBy(asc(jobRuns.name));
    return rows.map((row) => ({ ...row, lastStatus: row.lastStatus as JobState["lastStatus"] }));
  }
}
