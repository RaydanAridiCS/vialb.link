import { describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";
import { JobRunner, type Job } from "@/server/jobs/job-runner";
import { InMemoryJobRepository } from "@/server/repositories/in-memory/job.repository.memory";
import { FakeClock } from "../support/fixtures";

const MINUTE = 60_000;

function setup(jobs: Job[], repo = new InMemoryJobRepository(), clock = new FakeClock()) {
  const runner = new JobRunner({ clock, repo, jobs, logger });
  return { runner, repo, clock };
}

describe("JobRunner", () => {
  it("runs a job on the first tick and again only after its interval", async () => {
    const run = vi.fn(async () => "did things");
    const { runner, repo, clock } = setup([{ name: "a", intervalMs: 10 * MINUTE, run }]);

    await runner.tick();
    expect(run).toHaveBeenCalledTimes(1);
    expect(repo.rows.get("a")).toMatchObject({
      lastStatus: "ok",
      lastSummary: "did things",
      leaseUntil: null,
    });

    clock.advance(9 * MINUTE);
    await runner.tick();
    expect(run).toHaveBeenCalledTimes(1);

    clock.advance(2 * MINUTE);
    await runner.tick();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("measures the interval from the end of the run", async () => {
    const clock = new FakeClock();
    const run = vi.fn(async () => {
      clock.advance(5 * MINUTE);
    });
    const { runner, repo } = setup([{ name: "slow", intervalMs: 10 * MINUTE, run }], undefined, clock);
    await runner.tick();
    expect(repo.rows.get("slow")?.nextRunAt).toEqual(new Date(new FakeClock().now().getTime() + 15 * MINUTE));
  });

  it("two runners sharing a database never run the same job at once", async () => {
    const repo = new InMemoryJobRepository();
    const clock = new FakeClock();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const run = vi.fn(async () => {
      await gate;
    });
    const job: Job = { name: "once", intervalMs: MINUTE, run };
    const first = setup([job], repo, clock).runner;
    const second = setup([job], repo, clock).runner;

    const running = first.tick();
    await Promise.resolve();
    await second.tick(); // the lease is held, so this one skips the job
    release();
    await running;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a crashed run blocks others only until its lease expires", async () => {
    const repo = new InMemoryJobRepository();
    const clock = new FakeClock();
    await repo.tryClaim("j", clock.now(), new Date(clock.now().getTime() + 15 * MINUTE)); // claimed, never finished
    const run = vi.fn(async () => {});
    const { runner } = setup([{ name: "j", intervalMs: MINUTE, run }], repo, clock);

    await runner.tick();
    expect(run).not.toHaveBeenCalled();

    clock.advance(16 * MINUTE);
    await runner.tick();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("records a failure, keeps the loop alive and retries after the interval", async () => {
    const bad = vi.fn(async () => {
      throw new Error("boom");
    });
    const good = vi.fn(async () => "fine");
    const { runner, repo, clock } = setup([
      { name: "bad", intervalMs: 5 * MINUTE, run: bad },
      { name: "good", intervalMs: 5 * MINUTE, run: good },
    ]);

    await runner.tick();
    expect(good).toHaveBeenCalledTimes(1);
    expect(repo.rows.get("bad")).toMatchObject({ lastStatus: "error", lastError: "boom", leaseUntil: null });

    clock.advance(6 * MINUTE);
    await runner.tick();
    expect(bad).toHaveBeenCalledTimes(2);
  });

  it("skips disabled jobs without claiming them", async () => {
    const run = vi.fn(async () => {});
    let enabled = false;
    const { runner, repo } = setup([
      { name: "off", intervalMs: MINUTE, isEnabled: async () => enabled, run },
    ]);

    await runner.tick();
    expect(run).not.toHaveBeenCalled();
    expect(repo.rows.has("off")).toBe(false);

    enabled = true;
    await runner.tick();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("ignores overlapping ticks", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const run = vi.fn(async () => {
      await gate;
    });
    const { runner } = setup([{ name: "a", intervalMs: MINUTE, run }]);
    const first = runner.tick();
    await Promise.resolve();
    await runner.tick();
    release();
    await first;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runNow ignores the schedule but not a held lease", async () => {
    const run = vi.fn(async () => {});
    const { runner, repo, clock } = setup([{ name: "a", intervalMs: 60 * MINUTE, run }]);
    await runner.tick();
    expect(await runner.runNow("a")).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    expect(await runner.runNow("missing")).toBe(false);

    await repo.tryClaim("a", clock.now(), new Date(clock.now().getTime() + 15 * MINUTE), { force: true });
    expect(await runner.runNow("a")).toBe(false);
  });

  it("survives the repository itself failing", async () => {
    const repo = new InMemoryJobRepository();
    repo.tryClaim = vi.fn(async () => {
      throw new Error("db down");
    });
    const run = vi.fn(async () => {});
    const { runner } = setup([{ name: "a", intervalMs: MINUTE, run }], repo);
    await expect(runner.tick()).resolves.toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });
});
