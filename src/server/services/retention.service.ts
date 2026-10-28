import type { Logger } from "@/lib/logger";
import type { Actor } from "@/server/domain/types";
import { ValidationError } from "@/server/errors";
import { utcDay } from "@/server/lib/hashing";
import type { Clock } from "@/server/ports/clock";
import type { IClickRepository } from "@/server/repositories/click.repository";
import type { ISettingsRepository } from "@/server/repositories/settings.repository";
import { requireAdmin } from "./authorization";
import type { SettingsService } from "./settings.service";

const DAY_MS = 86_400_000;
/** Rows deleted per statement: small enough to keep locks short on a busy table. */
const BATCH = 10_000;
/** One run deletes at most this many batches (1M rows); the next run continues. */
const MAX_BATCHES = 100;
/** Salts older than this are useless (only today's is read) and keeping them lets old visitor hashes be re-derived. */
const SALT_KEEP_DAYS = 2;

export interface RetentionServiceDeps {
  clicks: IClickRepository;
  settingsRepo: ISettingsRepository;
  settings: SettingsService;
  clock: Clock;
  logger: Logger;
  sleep?: (ms: number) => Promise<void>;
}

/** Deletes old clicks (when a retention period is set) and old daily salts (always). */
export class RetentionService {
  constructor(private readonly deps: RetentionServiceDeps) {}

  cutoffFor(days: number): Date {
    return new Date(this.deps.clock.now().getTime() - days * DAY_MS);
  }

  async run(): Promise<string> {
    const { clicks, settingsRepo, settings, clock, logger } = this.deps;
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const days = (await settings.get()).clickRetentionDays;

    let deleted = 0;
    if (days > 0) {
      const cutoff = this.cutoffFor(days);
      for (let batch = 0; batch < MAX_BATCHES; batch++) {
        const removed = await clicks.deleteOlderThan(cutoff, BATCH);
        deleted += removed;
        if (removed < BATCH) break;
        await sleep(50);
      }
    }
    const saltDay = utcDay(new Date(clock.now().getTime() - SALT_KEEP_DAYS * DAY_MS));
    const salts = await settingsRepo.deleteSaltsBefore(saltDay);
    logger.info({ deleted, salts, days }, "Retention pass finished");
    return days > 0
      ? `deleted ${deleted} clicks older than ${days} days and ${salts} old salts`
      : `kept all clicks; deleted ${salts} old salts`;
  }

  /** For the admin form: how many clicks a retention period would remove right now, and of how many. */
  async preview(actor: Actor, days: number): Promise<{ wouldDelete: number; total: number }> {
    requireAdmin(actor);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new ValidationError("Choose between 1 and 3650 days");
    }
    const [wouldDelete, total] = await Promise.all([
      this.deps.clicks.countOlderThan(this.cutoffFor(days)),
      this.deps.clicks.count(),
    ]);
    return { wouldDelete, total };
  }
}
