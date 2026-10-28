import { RATE_LIMITS } from "@/lib/constants";
import type { Logger } from "@/lib/logger";
import type { Actor, Link, LinkHealth } from "@/server/domain/types";
import { ValidationError } from "@/server/errors";
import { applyOutcome, blankHealth, type CheckOutcome, type HealthPolicy } from "@/server/lib/health-state";
import { isExpired } from "@/server/lib/expiry";
import type { Clock } from "@/server/ports/clock";
import type { UrlProbe } from "@/server/ports/url-probe";
import type { UrlSafetyChecker } from "@/server/ports/url-safety-checker";
import type { HealthCandidate, ILinkHealthRepository } from "@/server/repositories/link-health.repository";
import type { AbuseService } from "./abuse.service";
import { requireLinkWriter } from "./authorization";
import { toHealthDto, type LinkHealthDto } from "./dto";
import type { LinkService } from "./link.service";
import type { SettingsService } from "./settings.service";

export interface HealthMonitorDeps {
  health: ILinkHealthRepository;
  links: LinkService;
  probe: UrlProbe;
  safety: UrlSafetyChecker;
  abuse: AbuseService;
  settings: SettingsService;
  clock: Clock;
  logger: Logger;
  policy: HealthPolicy;
  /** Links examined per scheduler pass. */
  batchSize?: number;
  /** Hosts contacted at the same time. */
  concurrency?: number;
  /** Minimum time between two requests to the same host. */
  hostGapMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_BATCH = 50;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_HOST_GAP_MS = 1000;

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Checks where links point. Polite by construction: bounded concurrency, a minimum gap per host, one
 * deadline per check, and failures only count after several consecutive misses. Which URLs may be
 * contacted at all is decided by the {@link UrlProbe} (SSRF protection), not here.
 */
export class HealthMonitorService {
  private readonly hostTail = new Map<string, Promise<void>>();
  private readonly hostLast = new Map<string, number>();

  constructor(private readonly deps: HealthMonitorDeps) {}

  async isEnabled(): Promise<boolean> {
    return (await this.deps.settings.get()).healthMonitorEnabled;
  }

  /** One scheduler pass: checks the most overdue links. Returns a one-line summary. */
  async runDue(): Promise<string> {
    const now = this.deps.clock.now();
    const candidates = await this.deps.health.listDue(now, this.deps.batchSize ?? DEFAULT_BATCH);
    const queue = [...candidates];
    let failed = 0;
    let flagged = 0;
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        try {
          const result = await this.checkCandidate(next);
          if (!result.ok) failed++;
          if (result.flaggedNow) flagged++;
        } catch (error) {
          this.deps.logger.warn({ err: error, linkId: next.linkId }, "Link health check crashed");
        }
      }
    };
    const workers = Math.min(this.deps.concurrency ?? DEFAULT_CONCURRENCY, queue.length);
    await Promise.all(Array.from({ length: workers }, worker));
    this.hostTail.clear();
    this.hostLast.clear();
    return `checked ${candidates.length} links, ${failed} failing, ${flagged} newly flagged`;
  }

  /** The "Re-check now" button. Counts as a real check, so repeated failures can flag the link. */
  async checkNow(actor: Actor, linkId: string): Promise<LinkHealthDto> {
    const user = requireLinkWriter(actor);
    const link = await this.deps.links.getOwned(actor, linkId);
    if (!(await this.isEnabled())) throw new ValidationError("Link health monitoring is turned off");
    assertCheckable(link, this.deps.clock.now());
    await this.deps.abuse.enforceRateLimit(`health:recheck:${user.userId}`, RATE_LIMITS.healthRecheck);

    const previous = (await this.deps.health.find(link.id)) ?? blankHealth(link.id, this.deps.clock.now());
    const result = await this.check(previous, link.destinationUrl, routingUrls(link));
    return toHealthDto(result.health);
  }

  /** Hides the "needs attention" badge until the link recovers and fails again. */
  async dismiss(actor: Actor, linkId: string): Promise<void> {
    requireLinkWriter(actor);
    const link = await this.deps.links.getOwned(actor, linkId);
    await this.deps.health.dismiss(link.id, this.deps.clock.now());
  }

  /** The destination or routing changed: earlier results describe a different target. */
  async reset(linkId: string): Promise<void> {
    await this.deps.health.delete(linkId);
  }

  private async checkCandidate(candidate: HealthCandidate) {
    const previous = candidate.health ?? blankHealth(candidate.linkId, this.deps.clock.now());
    return this.check(previous, candidate.destinationUrl, candidate.extraTargets);
  }

  private async check(previous: LinkHealth, destination: string, extra: readonly string[]) {
    const outcome = await this.evaluate([...new Set([destination, ...extra])]);
    const health = applyOutcome(previous, outcome, this.deps.clock.now(), this.deps.policy);
    await this.deps.health.save(health);
    return {
      health,
      ok: outcome.ok,
      flaggedNow: health.state === "flagged" && previous.state !== "flagged",
    };
  }

  /** Safe Browsing first (an authoritative hit flags at once), then each target's reachability. */
  private async evaluate(targets: readonly string[]): Promise<CheckOutcome> {
    if (this.deps.safety.isConfigured) {
      for (const target of targets) {
        const verdict = await this.deps.safety.check(target);
        if (!verdict.safe) {
          return { ok: false, reason: "unsafe", status: null, target, immediate: true };
        }
      }
    }
    let lastStatus: number | null = null;
    for (const target of targets) {
      const result = await this.gate(hostOf(target), () => this.deps.probe.probe(target));
      if (!result.ok) {
        return { ok: false, reason: result.reason, status: result.status, target };
      }
      lastStatus = result.status;
    }
    return { ok: true, reason: null, status: lastStatus, target: null };
  }

  /** Serialises requests per host and keeps a gap between them. */
  private gate<T>(host: string, task: () => Promise<T>): Promise<T> {
    const gap = this.deps.hostGapMs ?? DEFAULT_HOST_GAP_MS;
    const sleep = this.deps.sleep ?? realSleep;
    const previous = this.hostTail.get(host) ?? Promise.resolve();
    const run = previous.then(async () => {
      const wait =
        (this.hostLast.get(host) ?? Number.NEGATIVE_INFINITY) + gap - this.deps.clock.now().getTime();
      if (wait > 0) await sleep(wait);
      try {
        return await task();
      } finally {
        this.hostLast.set(host, this.deps.clock.now().getTime());
      }
    });
    this.hostTail.set(
      host,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }
}

function routingUrls(link: Link): string[] {
  return link.routingRules.map((rule) => rule.url);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
}

/** Same eligibility the scheduler uses, with a clear message for the on-demand button. */
function assertCheckable(link: Link, now: Date): void {
  if (link.kind !== "link") throw new ValidationError("This link is not checked");
  if (!link.isEnabled) throw new ValidationError("Disabled links are not checked");
  if (isExpired(link.expiresAt, now)) throw new ValidationError("Expired links are not checked");
  if (link.maxClicks !== null && link.clickCount >= link.maxClicks) {
    throw new ValidationError("Links that reached their visit limit are not checked");
  }
  if (link.passwordHash !== null) throw new ValidationError("Password-protected links are not checked");
}
