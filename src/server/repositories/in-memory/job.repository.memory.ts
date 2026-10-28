import type { IJobRepository, JobOutcome, JobState } from "@/server/repositories/job.repository";

export class InMemoryJobRepository implements IJobRepository {
  readonly rows = new Map<string, JobState>();

  async tryClaim(
    name: string,
    now: Date,
    leaseUntil: Date,
    options: { force?: boolean } = {},
  ): Promise<boolean> {
    let row = this.rows.get(name);
    if (!row) {
      row = {
        name,
        nextRunAt: now,
        leaseUntil: null,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastStatus: null,
        lastError: null,
        lastSummary: null,
      };
      this.rows.set(name, row);
    }
    if (!options.force && row.nextRunAt > now) return false;
    if (row.leaseUntil && row.leaseUntil > now) return false;
    row.leaseUntil = leaseUntil;
    row.lastStartedAt = now;
    return true;
  }

  async finish(name: string, outcome: JobOutcome): Promise<void> {
    const row = this.rows.get(name);
    if (!row) return;
    row.leaseUntil = null;
    row.nextRunAt = outcome.nextRunAt;
    row.lastFinishedAt = outcome.at;
    row.lastStatus = outcome.status;
    row.lastError = outcome.error ?? null;
    row.lastSummary = outcome.summary ?? null;
  }

  async list(): Promise<JobState[]> {
    return [...this.rows.values()].sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ ...r }));
  }
}
