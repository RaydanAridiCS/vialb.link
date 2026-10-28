import type { Actor, InstanceSettings, InstanceSettingsOverride } from "@/server/domain/types";
import type { ISettingsRepository } from "@/server/repositories/settings.repository";
import { normalizeDomainEntry } from "@/server/lib/url";
import { LIMITS } from "@/lib/constants";
import { cleanBranding, type InstanceBranding } from "@/lib/branding";
import { ValidationError } from "@/server/errors";
import { requireAdmin } from "./authorization";

const CACHE_TTL_MS = 5_000;

function isIntBetween(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export interface SettingsUpdate {
  /** `null` resets a field to its environment default. */
  allowAnonymousLinks?: boolean | null;
  allowSignups?: boolean | null;
  anonLinkTtlHours?: number | null;
  blockedDomains?: string[] | null;
  pixelsEnabled?: boolean | null;
  healthMonitorEnabled?: boolean | null;
  weeklyReportEnabled?: boolean | null;
  reportSendDay?: number | null;
  reportSendHourUtc?: number | null;
  clickRetentionDays?: number | null;
  requireAdmin2fa?: boolean | null;
  /** `null` resets to the default look. */
  branding?: InstanceBranding | null;
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
    try {
      const override = await this.repo.get();
      const value = this.merge(override);
      this.cache = { value, expiresAt: this.now() + CACHE_TTL_MS };
      return value;
    } catch {
      // If the database is unreachable or misconfigured, gracefully fall back to environment defaults.
      return this.defaults;
    }
  }

  /** Effective values plus which fields are overridden (for the admin UI). */
  async getDetailed(): Promise<{
    effective: InstanceSettings;
    overrides: InstanceSettingsOverride;
    defaults: InstanceSettings;
  }> {
    const fallbackOverride: InstanceSettingsOverride = {
      allowAnonymousLinks: null,
      allowSignups: null,
      anonLinkTtlHours: null,
      blockedDomains: null,
      pixelsEnabled: null,
      healthMonitorEnabled: null,
      weeklyReportEnabled: null,
      reportSendDay: null,
      reportSendHourUtc: null,
      clickRetentionDays: null,
      requireAdmin2fa: null,
      branding: null,
    };
    try {
      const override = (await this.repo.get()) ?? fallbackOverride;
      return { effective: this.merge(override), overrides: override, defaults: this.defaults };
    } catch {
      return { effective: this.defaults, overrides: fallbackOverride, defaults: this.defaults };
    }
  }

  async update(actor: Actor, update: SettingsUpdate): Promise<InstanceSettings> {
    if (actor.kind !== "system") requireAdmin(actor);
    const patch: Partial<InstanceSettingsOverride> = {};
    if (update.allowAnonymousLinks !== undefined) patch.allowAnonymousLinks = update.allowAnonymousLinks;
    if (update.allowSignups !== undefined) patch.allowSignups = update.allowSignups;
    if (update.pixelsEnabled !== undefined) patch.pixelsEnabled = update.pixelsEnabled;
    if (update.healthMonitorEnabled !== undefined) patch.healthMonitorEnabled = update.healthMonitorEnabled;
    if (update.weeklyReportEnabled !== undefined) patch.weeklyReportEnabled = update.weeklyReportEnabled;
    if (update.reportSendDay !== undefined) {
      if (update.reportSendDay !== null && !isIntBetween(update.reportSendDay, 0, 6)) {
        throw new ValidationError("The report day must be between 0 (Sunday) and 6 (Saturday)");
      }
      patch.reportSendDay = update.reportSendDay;
    }
    if (update.requireAdmin2fa !== undefined) patch.requireAdmin2fa = update.requireAdmin2fa;
    if (update.branding !== undefined) {
      if (update.branding === null) patch.branding = null;
      else {
        const { value, problems } = cleanBranding(update.branding);
        if (problems.length > 0)
          throw new ValidationError(problems[0] ?? "Invalid branding", { field: "branding" });
        patch.branding = Object.keys(value).length === 0 ? null : value;
      }
    }
    if (update.clickRetentionDays !== undefined) {
      if (update.clickRetentionDays !== null && !isIntBetween(update.clickRetentionDays, 0, 3650)) {
        throw new ValidationError("Click retention must be 0 (keep forever) or between 1 and 3650 days");
      }
      patch.clickRetentionDays = update.clickRetentionDays;
    }
    if (update.reportSendHourUtc !== undefined) {
      if (update.reportSendHourUtc !== null && !isIntBetween(update.reportSendHourUtc, 0, 23)) {
        throw new ValidationError("The report hour must be between 0 and 23");
      }
      patch.reportSendHourUtc = update.reportSendHourUtc;
    }
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
      pixelsEnabled: override?.pixelsEnabled ?? this.defaults.pixelsEnabled,
      healthMonitorEnabled: override?.healthMonitorEnabled ?? this.defaults.healthMonitorEnabled,
      weeklyReportEnabled: override?.weeklyReportEnabled ?? this.defaults.weeklyReportEnabled,
      reportSendDay: override?.reportSendDay ?? this.defaults.reportSendDay,
      reportSendHourUtc: override?.reportSendHourUtc ?? this.defaults.reportSendHourUtc,
      clickRetentionDays: override?.clickRetentionDays ?? this.defaults.clickRetentionDays,
      requireAdmin2fa: override?.requireAdmin2fa ?? this.defaults.requireAdmin2fa,
      branding: override?.branding ?? this.defaults.branding,
    };
  }
}
