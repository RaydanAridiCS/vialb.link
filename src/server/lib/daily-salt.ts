import type { ISettingsRepository } from "@/server/repositories/settings.repository";
import { randomToken } from "./hashing";

/**
 * The random salt of a UTC day, shared by click recording and A/B splits so a visitor's hash means the same
 * thing in both. Only the current day is kept in memory; the first request of a day creates the row.
 */
export class DailySaltProvider {
  private readonly salts = new Map<string, Promise<string>>();

  constructor(
    private readonly repo: ISettingsRepository,
    private readonly makeSalt: () => string = () => randomToken(32),
  ) {}

  forDay(day: string): Promise<string> {
    let salt = this.salts.get(day);
    if (!salt) {
      salt = this.repo.getOrCreateDailySalt(day, this.makeSalt());
      salt.catch(() => this.salts.delete(day));
      this.salts.clear(); // keep only the current day's salt in memory
      this.salts.set(day, salt);
    }
    return salt;
  }
}
