import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { clicks, links } from "@/server/db/schema";
import type {
  CursorPage,
  Link,
  LinkListQuery,
  LinkPatch,
  NewLink,
  Page,
  TimeseriesPoint,
  UserOverviewStats,
} from "@/server/domain/types";
import type { ILinkRepository } from "@/server/repositories/link.repository";
import { rethrowUniqueViolation } from "./pg-errors";

const DAY_MS = 24 * 60 * 60 * 1000;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export class DrizzleLinkRepository implements ILinkRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewLink): Promise<Link> {
    try {
      const [row] = await this.db.insert(links).values(input).returning();
      if (!row) throw new Error("Insert returned no row");
      return row;
    } catch (error) {
      rethrowUniqueViolation(error);
    }
  }

  async findById(id: string): Promise<Link | null> {
    const [row] = await this.db
      .select()
      .from(links)
      .where(and(eq(links.id, id), isNull(links.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async findByCode(code: string): Promise<Link | null> {
    const [row] = await this.db
      .select()
      .from(links)
      .where(and(eq(links.code, code), isNull(links.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async list(query: LinkListQuery): Promise<Page<Link>> {
    const conditions: (SQL | undefined)[] = [isNull(links.deletedAt)];
    if (query.userId !== undefined) conditions.push(eq(links.userId, query.userId));

    const search = query.search?.trim();
    if (search) {
      const pattern = `%${escapeLike(search)}%`;
      conditions.push(
        or(ilike(links.code, pattern), ilike(links.title, pattern), ilike(links.destinationUrl, pattern)),
      );
    }

    const limitReached = and(isNotNull(links.maxClicks), sql`${links.clickCount} >= ${links.maxClicks}`);
    const expired = and(isNotNull(links.expiresAt), lte(links.expiresAt, query.now));
    switch (query.status) {
      case "active":
        conditions.push(
          eq(links.isEnabled, true),
          or(isNull(links.expiresAt), gt(links.expiresAt, query.now)),
          or(isNull(links.maxClicks), sql`${links.clickCount} < ${links.maxClicks}`),
        );
        break;
      case "expired":
        conditions.push(or(expired, limitReached));
        break;
      case "disabled":
        conditions.push(eq(links.isEnabled, false));
        break;
      case "protected":
        conditions.push(isNotNull(links.passwordHash));
        break;
      default:
        break;
    }

    const where = and(...conditions);
    const orderBy = (() => {
      switch (query.sort) {
        case "created_asc":
          return [asc(links.createdAt), asc(links.id)];
        case "clicks_desc":
          return [desc(links.clickCount), desc(links.createdAt)];
        case "clicks_asc":
          return [asc(links.clickCount), desc(links.createdAt)];
        default:
          return [desc(links.createdAt), desc(links.id)];
      }
    })();

    const [items, totals] = await Promise.all([
      this.db
        .select()
        .from(links)
        .where(where)
        .orderBy(...orderBy)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ total: count() }).from(links).where(where),
    ]);

    return { items, total: totals[0]?.total ?? 0, page: query.page, pageSize: query.pageSize };
  }

  async listByCursor(userId: string, cursor: string | null, limit: number): Promise<CursorPage<Link>> {
    // uuidv7 ids are time-ordered, so the id doubles as a stable keyset cursor.
    const rows = await this.db
      .select()
      .from(links)
      .where(
        and(eq(links.userId, userId), isNull(links.deletedAt), cursor ? lt(links.id, cursor) : undefined),
      )
      .orderBy(desc(links.id))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  async listAllByUser(userId: string): Promise<Link[]> {
    return this.db
      .select()
      .from(links)
      .where(and(eq(links.userId, userId), isNull(links.deletedAt)))
      .orderBy(desc(links.createdAt));
  }

  async update(id: string, patch: LinkPatch): Promise<Link | null> {
    if (Object.keys(patch).length === 0) return this.findById(id);
    const [row] = await this.db
      .update(links)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(links.id, id), isNull(links.deletedAt)))
      .returning();
    return row ?? null;
  }

  async softDelete(ids: readonly string[], at: Date): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.db
      .update(links)
      .set({ deletedAt: at, isEnabled: false, claimTokenHash: null })
      .where(and(inArray(links.id, [...ids]), isNull(links.deletedAt)))
      .returning({ id: links.id });
    return rows.length;
  }

  async setEnabled(ids: readonly string[], enabled: boolean): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.db
      .update(links)
      .set({ isEnabled: enabled, updatedAt: new Date() })
      .where(and(inArray(links.id, [...ids]), isNull(links.deletedAt)))
      .returning({ id: links.id });
    return rows.length;
  }

  async consumeAccess(id: string): Promise<string | null> {
    // Single atomic statement: the row lock taken by UPDATE serialises
    // concurrent consumers, so the limit can never be exceeded.
    const [row] = await this.db
      .update(links)
      .set({ clickCount: sql`${links.clickCount} + 1` })
      .where(
        and(
          eq(links.id, id),
          isNull(links.deletedAt),
          or(isNull(links.maxClicks), sql`${links.clickCount} < ${links.maxClicks}`),
        ),
      )
      .returning({ destinationUrl: links.destinationUrl });
    return row?.destinationUrl ?? null;
  }

  async findByClaimTokenHashes(hashes: readonly string[]): Promise<Link[]> {
    if (hashes.length === 0) return [];
    return this.db
      .select()
      .from(links)
      .where(and(inArray(links.claimTokenHash, [...hashes]), isNull(links.userId), isNull(links.deletedAt)));
  }

  async claim(ids: readonly string[], userId: string): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.db
      .update(links)
      .set({ userId, claimTokenHash: null, updatedAt: new Date() })
      .where(and(inArray(links.id, [...ids]), isNull(links.userId), isNull(links.deletedAt)))
      .returning({ id: links.id });
    return rows.length;
  }

  async overview(userId: string | undefined, now: Date): Promise<UserOverviewStats> {
    const owner = userId === undefined ? undefined : eq(links.userId, userId);
    const since7 = new Date(now.getTime() - 7 * DAY_MS);
    const since30 = new Date(now.getTime() - 29 * DAY_MS);
    const humanClicks = (since: Date) =>
      and(
        owner,
        isNull(links.deletedAt),
        eq(clicks.isBot, false),
        sql`${clicks.occurredAt} >= ${since.toISOString()}::timestamptz`,
      );

    const [linkTotals, c7, c30, topLinks, daily] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(links)
        .where(and(owner, isNull(links.deletedAt))),
      this.db
        .select({ total: count() })
        .from(clicks)
        .innerJoin(links, eq(clicks.linkId, links.id))
        .where(humanClicks(since7)),
      this.db
        .select({ total: count() })
        .from(clicks)
        .innerJoin(links, eq(clicks.linkId, links.id))
        .where(humanClicks(since30)),
      this.db
        .select({ id: links.id, code: links.code, title: links.title, clicks: sql<number>`count(*)::int` })
        .from(clicks)
        .innerJoin(links, eq(clicks.linkId, links.id))
        .where(humanClicks(since30))
        .groupBy(links.id, links.code, links.title)
        .orderBy(sql`count(*) desc`)
        .limit(5),
      this.db.execute<{ bucket: Date | string; clicks: number }>(sql`
        with series as (
          select generate_series(
            date_trunc('day', ${since30.toISOString()}::timestamptz at time zone 'UTC'),
            date_trunc('day', ${now.toISOString()}::timestamptz at time zone 'UTC'),
            interval '1 day'
          ) at time zone 'UTC' as bucket
        ), counts as (
          select date_trunc('day', ${clicks.occurredAt} at time zone 'UTC') at time zone 'UTC' as bucket,
                 count(*)::int as clicks
          from ${clicks}
          inner join ${links} on ${clicks.linkId} = ${links.id}
          where ${humanClicks(since30)}
          group by 1
        )
        select s.bucket, coalesce(c.clicks, 0)::int as clicks
        from series s left join counts c on c.bucket = s.bucket
        order by s.bucket
      `),
    ]);

    return {
      totalLinks: linkTotals[0]?.total ?? 0,
      clicks7d: c7[0]?.total ?? 0,
      clicks30d: c30[0]?.total ?? 0,
      topLinks,
      daily: [...daily].map((row): TimeseriesPoint => ({
        bucket: new Date(row.bucket),
        clicks: Number(row.clicks),
      })),
    };
  }

  async count(): Promise<number> {
    const [row] = await this.db.select({ total: count() }).from(links).where(isNull(links.deletedAt));
    return row?.total ?? 0;
  }
}
