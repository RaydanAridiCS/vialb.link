import "server-only";
import { env } from "@/lib/env";
import { getContainer } from "@/server/container";

declare global {
  var __vialbJobsTimer: ReturnType<typeof setInterval> | undefined;
}

const TICK_MS = 60_000;
const FIRST_TICK_MS = 15_000;

/**
 * Starts the in-process scheduler once per server process. Which instance runs a job is decided by the
 * database claim in {@link JobRunner}, so every replica may call this safely; `JOBS_ENABLED=false`
 * keeps a replica out of it entirely.
 */
export function startJobs(): void {
  if (!env.JOBS_ENABLED || globalThis.__vialbJobsTimer) return;
  const runner = getContainer().jobRunner;
  const tick = () => void runner.tick();
  globalThis.__vialbJobsTimer = setInterval(tick, TICK_MS);
  globalThis.__vialbJobsTimer.unref();
  setTimeout(tick, FIRST_TICK_MS).unref();
}
