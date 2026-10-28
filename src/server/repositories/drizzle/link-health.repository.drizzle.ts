import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { linkHealth, links } from "@/server/db/schema";
import type { LinkHealth } from "@/server/domain/types";
import type {
  FlaggedLink,
  HealthCandidate,
  ILinkHealthRepository,
} from "@/server/repositories/link-health.repository";

type HealthRow = typeof linkHealth.$inferSelect;

function toDomain(row: HealthRow): LinkHealth {
  return { ...row };
}

/** Links the monitor may look at: live, reachable by visitors without a password, owned by a workspace. */
function checkable(now: Date) {
  return and(
    isNull(links.deletedAt),
    eq(links.isEnabled, true),
    eq(links.kind, "link"),
    isNotNull(links.workspaceId),
    isNull(links.passwordHash),
    or(isNull(links.expiresAt), gt(links.expiresAt, now)),
    or(isNull(links.maxClicks), lt(links.clickCount, links.maxClicks)),
  );
}

export class DrizzleLinkHealthRepository implements ILinkHealthRepository {
  constructor(private readonly db: Database) {}

  async listDue(now: Date, limit: number): Promise<HealthCandidate[]> {
    const rows = await this.db
      .select({
        id: links.id,
        workspaceId: links.workspaceId,
        destinationUrl: links.destinationUrl,
        routingRules: links.routingRules,
        health: linkHealth,
      })
      .from(links)
      .leftJoin(linkHealth, eq(linkHealth.linkId, links.id))
      .where(and(checkable(now), or(isNull(linkHealth.linkId), lte(linkHealth.nextCheckAt, now))))
      .orderBy(asc(sql`coalesce(${linkHealth.nextCheckAt}, ${links.createdAt})`))
      .limit(limit);
    return rows.flatMap((row) =>
      row.workspaceId === null
        ? []
        : [
            {
              linkId: row.id,
              workspaceId: row.workspaceId,
              destinationUrl: row.destinationUrl,
              extraTargets: routingTargets(row.routingRules),
              health: row.health ? toDomain(row.health) : null,
            },
          ],
    );
  }

  async find(linkId: string): Promise<LinkHealth | null> {
    const [row] = await this.db.select().from(linkHealth).where(eq(linkHealth.linkId, linkId)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findMany(linkIds: readonly string[]): Promise<LinkHealth[]> {
    if (linkIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(linkHealth)
      .where(inArray(linkHealth.linkId, [...linkIds]));
    return rows.map(toDomain);
  }

  async save(health: LinkHealth): Promise<void> {
    await this.db
      .insert(linkHealth)
      .values(health)
      .onConflictDoUpdate({ target: linkHealth.linkId, set: { ...health } });
  }

  async delete(linkId: string): Promise<void> {
    await this.db.delete(linkHealth).where(eq(linkHealth.linkId, linkId));
  }

  async dismiss(linkId: string, at: Date): Promise<boolean> {
    const updated = await this.db
      .update(linkHealth)
      .set({ dismissedAt: at })
      .where(
        and(eq(linkHealth.linkId, linkId), eq(linkHealth.state, "flagged"), isNull(linkHealth.dismissedAt)),
      )
      .returning({ linkId: linkHealth.linkId });
    return updated.length === 1;
  }

  async listWorkspacesWithFlagged(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ workspaceId: links.workspaceId })
      .from(linkHealth)
      .innerJoin(links, eq(links.id, linkHealth.linkId))
      .where(and(eq(linkHealth.state, "flagged"), isNull(linkHealth.dismissedAt), checkable(new Date())));
    return rows.flatMap((row) => (row.workspaceId ? [row.workspaceId] : []));
  }

  async listFlaggedByWorkspace(workspaceId: string, limit: number): Promise<FlaggedLink[]> {
    const rows = await this.db
      .select({
        linkId: links.id,
        code: links.code,
        title: links.title,
        destinationUrl: links.destinationUrl,
        reason: linkHealth.lastReason,
        failingTarget: linkHealth.failingTarget,
        flaggedAt: linkHealth.flaggedAt,
      })
      .from(linkHealth)
      .innerJoin(links, eq(links.id, linkHealth.linkId))
      .where(
        and(
          eq(links.workspaceId, workspaceId),
          eq(linkHealth.state, "flagged"),
          isNull(linkHealth.dismissedAt),
          checkable(new Date()),
        ),
      )
      .orderBy(asc(linkHealth.flaggedAt))
      .limit(limit);
    return rows;
  }
}

/** Every URL a rule can send visitors to (the rule URL; split arms are added with A/B splits). */
function routingTargets(rules: { url: string; variants?: { url: string }[] }[]): string[] {
  const urls = new Set<string>();
  for (const rule of rules) {
    urls.add(rule.url);
    for (const variant of rule.variants ?? []) urls.add(variant.url);
  }
  return [...urls];
}
