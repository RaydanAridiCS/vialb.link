import type { LinkHealth } from "@/server/domain/types";
import { needsAttention } from "@/server/lib/health-state";
import type {
  FlaggedLink,
  HealthCandidate,
  ILinkHealthRepository,
} from "@/server/repositories/link-health.repository";
import type { InMemoryLinkRepository } from "./link.repository.memory";

export class InMemoryLinkHealthRepository implements ILinkHealthRepository {
  readonly rows = new Map<string, LinkHealth>();

  constructor(private readonly linkRepo: InMemoryLinkRepository) {}

  private sync(linkId: string) {
    const row = this.rows.get(linkId);
    if (row && needsAttention(row)) this.linkRepo.attentionIds.add(linkId);
    else this.linkRepo.attentionIds.delete(linkId);
  }

  async listDue(now: Date, limit: number): Promise<HealthCandidate[]> {
    const due: { candidate: HealthCandidate; at: number }[] = [];
    for (const link of this.linkRepo.rows.values()) {
      if (link.deletedAt || !link.isEnabled || link.kind !== "link" || link.workspaceId === null) continue;
      if (link.passwordHash !== null) continue;
      if (link.expiresAt && link.expiresAt <= now) continue;
      if (link.maxClicks !== null && link.clickCount >= link.maxClicks) continue;
      const health = this.rows.get(link.id) ?? null;
      if (health && health.nextCheckAt > now) continue;
      const extra = new Set<string>();
      for (const rule of link.routingRules) {
        extra.add(rule.url);
        for (const variant of rule.variants ?? []) extra.add(variant.url);
      }
      due.push({
        at: (health?.nextCheckAt ?? link.createdAt).getTime(),
        candidate: {
          linkId: link.id,
          workspaceId: link.workspaceId,
          destinationUrl: link.destinationUrl,
          extraTargets: [...extra],
          health: health ? { ...health } : null,
        },
      });
    }
    return due
      .sort((a, b) => a.at - b.at)
      .slice(0, limit)
      .map((entry) => entry.candidate);
  }

  async find(linkId: string): Promise<LinkHealth | null> {
    const row = this.rows.get(linkId);
    return row ? { ...row } : null;
  }

  async findMany(linkIds: readonly string[]): Promise<LinkHealth[]> {
    return linkIds.flatMap((id) => {
      const row = this.rows.get(id);
      return row ? [{ ...row }] : [];
    });
  }

  async save(health: LinkHealth): Promise<void> {
    this.rows.set(health.linkId, { ...health });
    this.sync(health.linkId);
  }

  async delete(linkId: string): Promise<void> {
    this.rows.delete(linkId);
    this.sync(linkId);
  }

  async dismiss(linkId: string, at: Date): Promise<boolean> {
    const row = this.rows.get(linkId);
    if (!row || row.state !== "flagged" || row.dismissedAt) return false;
    row.dismissedAt = at;
    this.sync(linkId);
    return true;
  }

  async listWorkspacesWithFlagged(): Promise<string[]> {
    const found = new Set<string>();
    for (const row of this.rows.values()) {
      const link = this.linkRepo.rows.get(row.linkId);
      if (link && !link.deletedAt && link.workspaceId && needsAttention(row)) found.add(link.workspaceId);
    }
    return [...found];
  }

  async listFlaggedByWorkspace(workspaceId: string, limit: number): Promise<FlaggedLink[]> {
    const flagged: FlaggedLink[] = [];
    for (const row of this.rows.values()) {
      const link = this.linkRepo.rows.get(row.linkId);
      if (!link || link.deletedAt || link.workspaceId !== workspaceId || !needsAttention(row)) continue;
      flagged.push({
        linkId: link.id,
        code: link.code,
        title: link.title,
        destinationUrl: link.destinationUrl,
        reason: row.lastReason,
        failingTarget: row.failingTarget,
        flaggedAt: row.flaggedAt,
      });
    }
    return flagged.slice(0, limit);
  }
}
