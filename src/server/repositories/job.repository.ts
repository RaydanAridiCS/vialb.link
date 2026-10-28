export interface JobState {
  name: string;
  nextRunAt: Date;
  leaseUntil: Date | null;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
  lastSummary: string | null;
}

export interface JobOutcome {
  at: Date;
  nextRunAt: Date;
  status: "ok" | "error";
  error?: string | null;
  summary?: string | null;
}

/** Persistence for the in-process scheduler. Claims are compare-and-set so replicas never double-run. */
export interface IJobRepository {
  /**
   * Creates the job row on first use, then takes the lease if the job is due and nobody holds one.
   * Exactly one caller wins when several race. `force` ignores the schedule (not the lease).
   */
  tryClaim(name: string, now: Date, leaseUntil: Date, options?: { force?: boolean }): Promise<boolean>;
  /** Releases the lease and records the outcome. */
  finish(name: string, outcome: JobOutcome): Promise<void>;
  list(): Promise<JobState[]>;
}
