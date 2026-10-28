import type { Logger } from "@/lib/logger";
import type { Clock } from "@/server/ports/clock";
import type { IJobRepository } from "@/server/repositories/job.repository";

export interface Job {
  name: string;
  /** Minimum time between the end of one run and the start of the next. */
  intervalMs: number;
  /** How long a crashed run blocks the job before another instance may take over. */
  leaseMs?: number;
  /** Checked on every tick before claiming, so instance switches take effect without a restart. */
  isEnabled?: () => Promise<boolean>;
  /** A string result becomes the one-line summary shown in the admin UI; anything else is ignored. */
  run: (context: { now: Date }) => Promise<unknown>;
}

export interface JobRunnerDeps {
  clock: Clock;
  repo: IJobRepository;
  jobs: readonly Job[];
  logger: Logger;
}

const DEFAULT_LEASE_MS = 15 * 60 * 1000;

/**
 * Runs due jobs one after another. A job runs only on the instance whose compare-and-set claim wins, so
 * restarts and several replicas cannot run it twice. Failures are recorded and never stop the loop.
 */
export class JobRunner {
  private ticking = false;

  constructor(private readonly deps: JobRunnerDeps) {}

  /** One pass over all jobs. Safe to call concurrently: overlapping calls are skipped. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const job of this.deps.jobs) await this.runIfDue(job);
    } finally {
      this.ticking = false;
    }
  }

  /** Forces one job to run now if nobody else holds it (the admin "run now" button). */
  async runNow(name: string): Promise<boolean> {
    const job = this.deps.jobs.find((candidate) => candidate.name === name);
    if (!job) return false;
    return this.runIfDue(job, true);
  }

  private async runIfDue(job: Job, ignoreSchedule = false): Promise<boolean> {
    const { clock, repo, logger } = this.deps;
    try {
      if (job.isEnabled && !(await job.isEnabled())) return false;
      const now = clock.now();
      const leaseUntil = new Date(now.getTime() + (job.leaseMs ?? DEFAULT_LEASE_MS));
      const claimed = await repo.tryClaim(job.name, now, leaseUntil, { force: ignoreSchedule });
      if (!claimed) return false;

      let status: "ok" | "error" = "ok";
      let error: string | null = null;
      let summary: string | null = null;
      try {
        const result = await job.run({ now });
        summary = typeof result === "string" ? result : null;
      } catch (cause) {
        status = "error";
        error = cause instanceof Error ? cause.message : String(cause);
        logger.error({ err: cause, job: job.name }, "Scheduled job failed");
      }
      const finished = clock.now();
      await repo.finish(job.name, {
        at: finished,
        nextRunAt: new Date(finished.getTime() + job.intervalMs),
        status,
        error,
        summary,
      });
      return true;
    } catch (cause) {
      // The repository itself failed (database down): try again on the next tick.
      logger.error({ err: cause, job: job.name }, "Job scheduling failed");
      return false;
    }
  }
}
