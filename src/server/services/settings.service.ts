import type { Actor, InstanceSettings, InstanceSettingsOverride } from "@/server/domain/types";
import type { ISettingsRepository } from "@/server/repositories/settings.repository";
import { normalizeDomainEntry } from "@/server/lib/url";
import { LIMITS } from "@/lib/constants";
import { ValidationError } from "@/server/errors";
import { requireAdmin } from "./authorization";

const CACHE_TTL_MS = 5_000;

export interface SettingsUpdate {
  /** `null` resets a field to its environment default. */
  allowAnonymousLinks?: boolean | null;
  allowSignups?: boolean | null;
  anonLinkTtlHours?: number | null;
  blockedDomains?: string[] | null;
}

/**
 * Effective instance settings = environment defaults overlaid with the
 * admin's explicit overrides from the database. Cached briefly so hot paths
 * (link creation, sign-up) don't hit the DB on every request.
 */
export class SettingsService {
  private cache: { value: InstanceSettings; expiresAt: number } | null = null;

  constructor(
    private readonly repo: ISettingsRepository,
    private readonly defaults: InstanceSettings,
    private readonly now: () => number = Date.now,
  ) {}

  async get(): Promise<InstanceSettings> {
    if (this.cache && this.cache.expiresAt > this.now()) return this.cache.value;
    const override = await this.repo.get();
    const value = this.merge(override);
    this.cache = { value, expiresAt: this.now() + CACHE_TTL_MS };
    return value;
  }

  /** Effective values plus which fields are overridden (for the admin UI). */
  async getDetailed(): Promise<{
    effective: InstanceSettings;
    overrides: InstanceSettingsOverride;
    defaults: InstanceSettings;
  }> {
    const override = (await this.repo.get()) ?? {
      allowAnonymousLinks: null,
      allowSignups: null,
      anonLinkTtlHours: null,
      blockedDomains: null,
    };
    return { effective: this.merge(override), overrides: override, defaults: this.defaults };
  }

  async update(actor: Actor, update: SettingsUpdate): Promise<InstanceSettings> {
    if (actor.kind !== "system") requireAdmin(actor);
    const patch: Partial<InstanceSettingsOverride> = {};
    if (update.allowAnonymousLinks !== undefined) patch.allowAnonymousLinks = update.allowAnonymousLinks;
    if (update.allowSignups !== undefined) patch.allowSignups = update.allowSignups;
    if (update.anonLinkTtlHours !== undefined) {
      if (
        update.anonLinkTtlHours !== null &&
        (update.anonLinkTtlHours < 1 || update.anonLinkTtlHours > 8760)
      ) {
        throw new ValidationError("Anonymous link TTL must be between 1 and 8760 hours");
      }
      patch.anonLinkTtlHours = update.anonLinkTtlHours;
    }
    if (update.blockedDomains !== undefined) {
      patch.blockedDomains =
        update.blockedDomains === null ? null : SettingsService.normalizeDomains(update.blockedDomains);
    }
    await this.repo.upsert(patch);
    this.cache = null;
    return this.get();
  }

  static normalizeDomains(entries: readonly string[]): string[] {
    const domains = new Set<string>();
    for (const entry of entries) {
      const domain = normalizeDomainEntry(entry);
      if (domain) domains.add(domain);
    }
    if (domains.size > LIMITS.blockedDomainsMax) {
      throw new ValidationError(`At most ${LIMITS.blockedDomainsMax} blocked domains are supported`);
    }
    return [...domains].sort();
  }

  private merge(override: InstanceSettingsOverride | null): InstanceSettings {
    return {
      allowAnonymousLinks: override?.allowAnonymousLinks ?? this.defaults.allowAnonymousLinks,
      allowSignups: override?.allowSignups ?? this.defaults.allowSignups,
      anonLinkTtlHours: override?.anonLinkTtlHours ?? this.defaults.anonLinkTtlHours,
      blockedDomains: override?.blockedDomains ?? this.defaults.blockedDomains,
    };
  }
}
