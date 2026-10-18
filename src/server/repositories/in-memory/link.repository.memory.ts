import { v7 as uuidv7 } from "uuid";
import type {
  CursorPage,
  Link,
  LinkListQuery,
  LinkPatch,
  NewLink,
  Page,
  UserOverviewStats,
} from "@/server/domain/types";
import { UniqueViolationError } from "@/server/errors";
import type { ILinkRepository } from "@/server/repositories/link.repository";

/** In-memory fake for unit tests. Mirrors the Drizzle semantics, not its performance. */
export class InMemoryLinkRepository implements ILinkRepository {
  readonly rows = new Map<string, Link>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async create(input: NewLink): Promise<Link> {
    for (const row of this.rows.values()) {
      if (row.code === input.code) throw new UniqueViolationError("links_code_unique");
    }
    const at = input.createdAt ?? this.now();
    const link: Link = {
      id: uuidv7(),
      code: input.code,
      destinationUrl: input.destinationUrl,
      userId: input.userId ?? null,
      title: input.title ?? null,
      passwordHash: input.passwordHash ?? null,
      expiresAt: input.expiresAt ?? null,
      maxClicks: input.maxClicks ?? null,
      clickCount: input.clickCount ?? 0,
      isEnabled: input.isEnabled ?? true,
      deletedAt: null,
      ogTitle: input.ogTitle ?? null,
      ogDescription: input.ogDescription ?? null,
      ogImageUrl: input.ogImageUrl ?? null,
      qrFgColor: input.qrFgColor ?? "#000000",
      qrBgColor: input.qrBgColor ?? "#FFFFFF",
      createdIpHash: input.createdIpHash ?? null,
      claimTokenHash: input.claimTokenHash ?? null,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.set(link.id, link);
    return { ...link };
  }

  async findById(id: string): Promise<Link | null> {
    const row = this.rows.get(id);
    return row && !row.deletedAt ? { ...row } : null;
  }

  async findByCode(code: string): Promise<Link | null> {
    for (const row of this.rows.values()) {
      if (row.code === code && !row.deletedAt) return { ...row };
    }
    return null;
  }

  async list(query: LinkListQuery): Promise<Page<Link>> {
    const search = query.search?.trim().toLowerCase();
    const now = query.now.getTime();
    const isExpired = (l: Link) =>
      (l.expiresAt !== null && l.expiresAt.getTime() <= now) ||
      (l.maxClicks !== null && l.clickCount >= l.maxClicks);

    let items = [...this.rows.values()].filter((l) => !l.deletedAt);
    if (query.userId !== undefined) items = items.filter((l) => l.userId === query.userId);
    if (search) {
      items = items.filter((l) =>
        [l.code, l.title ?? "", l.destinationUrl].some((v) => v.toLowerCase().includes(search)),
      );
    }
    switch (query.status) {
      case "active":
        items = items.filter((l) => l.isEnabled && !isExpired(l));
        break;
      case "expired":
        items = items.filter(isExpired);
        break;
      case "disabled":
        items = items.filter((l) => !l.isEnabled);
        break;
      case "protected":
        items = items.filter((l) => l.passwordHash !== null);
        break;
      default:
        break;
    }
    const byCreated = (a: Link, b: Link) => a.createdAt.getTime() - b.createdAt.getTime();
    switch (query.sort) {
      case "created_asc":
        items.sort(byCreated);
        break;
      case "clicks_desc":
        items.sort((a, b) => b.clickCount - a.clickCount || byCreated(b, a));
        break;
      case "clicks_asc":
        items.sort((a, b) => a.clickCount - b.clickCount || byCreated(b, a));
        break;
      default:
        items.sort((a, b) => byCreated(b, a));
    }
    const start = (query.page - 1) * query.pageSize;
    return {
      items: items.slice(start, start + query.pageSize).map((l) => ({ ...l })),
      total: items.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async listByCursor(userId: string, cursor: string | null, limit: number): Promise<CursorPage<Link>> {
    const rows = [...this.rows.values()]
      .filter((l) => l.userId === userId && !l.deletedAt && (!cursor || l.id < cursor))
      .sort((a, b) => (a.id < b.id ? 1 : -1));
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
  }

  async listAllByUser(userId: string): Promise<Link[]> {
    return [...this.rows.values()].filter((l) => l.userId === userId && !l.deletedAt);
  }

  async update(id: string, patch: LinkPatch): Promise<Link | null> {
    const row = this.rows.get(id);
    if (!row || row.deletedAt) return null;
    Object.assign(row, patch, { updatedAt: this.now() });
    return { ...row };
  }

  async softDelete(ids: readonly string[], at: Date): Promise<number> {
    let n = 0;
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row && !row.deletedAt) {
        row.deletedAt = at;
        row.isEnabled = false;
        row.claimTokenHash = null;
        n++;
      }
    }
    return n;
  }

  async setEnabled(ids: readonly string[], enabled: boolean): Promise<number> {
    let n = 0;
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row && !row.deletedAt) {
        row.isEnabled = enabled;
        n++;
      }
    }
    return n;
  }

  async consumeAccess(id: string): Promise<string | null> {
    const row = this.rows.get(id);
    if (!row || row.deletedAt) return null;
    if (row.maxClicks !== null && row.clickCount >= row.maxClicks) return null;
    row.clickCount += 1;
    return row.destinationUrl;
  }

  async findByClaimTokenHashes(hashes: readonly string[]): Promise<Link[]> {
    const wanted = new Set(hashes);
    return [...this.rows.values()].filter(
      (l) => l.claimTokenHash !== null && wanted.has(l.claimTokenHash) && !l.userId && !l.deletedAt,
    );
  }

  async claim(ids: readonly string[], userId: string): Promise<number> {
    let n = 0;
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row && !row.userId && !row.deletedAt) {
        row.userId = userId;
        row.claimTokenHash = null;
        n++;
      }
    }
    return n;
  }

  async overview(userId: string | undefined): Promise<UserOverviewStats> {
    const owned = [...this.rows.values()].filter(
      (l) => !l.deletedAt && (userId === undefined || l.userId === userId),
    );
    return { totalLinks: owned.length, clicks7d: 0, clicks30d: 0, topLinks: [], daily: [] };
  }

  async count(): Promise<number> {
    return [...this.rows.values()].filter((l) => !l.deletedAt).length;
  }
}
