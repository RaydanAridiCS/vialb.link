import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { UniqueViolationError } from "@/server/errors";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { DrizzleClickRepository } from "@/server/repositories/drizzle/click.repository.drizzle";
import { connect, createUser, truncateAll } from "./helpers";

const { db, close } = connect();
const repo = new DrizzleLinkRepository(db);
const clicks = new DrizzleClickRepository(db);

afterAll(close);
beforeEach(() => truncateAll(db));

const now = new Date("2026-06-01T12:00:00Z");

describe("DrizzleLinkRepository", () => {
  it("creates and finds links by case-sensitive code", async () => {
    const user = await createUser(db);
    const link = await repo.create({
      code: "AbC123",
      destinationUrl: "https://example.com",
      userId: user.id,
    });
    expect(link.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await repo.findByCode("AbC123")).toMatchObject({ id: link.id, clickCount: 0, isEnabled: true });
    expect(await repo.findByCode("abc123")).toBeNull();
    expect(await repo.findById(link.id)).not.toBeNull();
  });

  it("raises UniqueViolationError for duplicate codes, including soft-deleted ones", async () => {
    const link = await repo.create({ code: "taken", destinationUrl: "https://a.example" });
    await expect(repo.create({ code: "taken", destinationUrl: "https://b.example" })).rejects.toBeInstanceOf(
      UniqueViolationError,
    );
    await repo.softDelete([link.id], now);
    expect(await repo.findByCode("taken")).toBeNull();
    await expect(repo.create({ code: "taken", destinationUrl: "https://c.example" })).rejects.toBeInstanceOf(
      UniqueViolationError,
    );
  });

  it("lists with search, status filters, sorting and pagination", async () => {
    const user = await createUser(db);
    const other = await createUser(db);
    await repo.create({
      code: "alpha",
      destinationUrl: "https://alpha.example",
      userId: user.id,
      title: "Alpha",
    });
    await repo.create({
      code: "beta",
      destinationUrl: "https://beta.example",
      userId: user.id,
      expiresAt: new Date(now.getTime() - 1000),
    });
    await repo.create({
      code: "gamma",
      destinationUrl: "https://g.example",
      userId: user.id,
      isEnabled: false,
    });
    await repo.create({
      code: "delta",
      destinationUrl: "https://d.example",
      userId: user.id,
      passwordHash: "x",
      maxClicks: 1,
      clickCount: 1,
    });
    await repo.create({ code: "other", destinationUrl: "https://o.example", userId: other.id });

    const base = { userId: user.id, page: 1, pageSize: 10, now };
    expect((await repo.list(base)).total).toBe(4);
    expect((await repo.list({ ...base, search: "alp" })).items.map((l) => l.code)).toEqual(["alpha"]);
    expect((await repo.list({ ...base, search: "%" })).total).toBe(0);
    expect((await repo.list({ ...base, status: "active" })).items.map((l) => l.code)).toEqual(["alpha"]);
    expect((await repo.list({ ...base, status: "expired" })).items.map((l) => l.code).sort()).toEqual([
      "beta",
      "delta",
    ]);
    expect((await repo.list({ ...base, status: "disabled" })).items.map((l) => l.code)).toEqual(["gamma"]);
    expect((await repo.list({ ...base, status: "protected" })).items.map((l) => l.code)).toEqual(["delta"]);
    expect((await repo.list({ ...base, sort: "clicks_desc" })).items[0]?.code).toBe("delta");
    const page2 = await repo.list({ ...base, pageSize: 3, page: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(4);
    expect((await repo.list({ page: 1, pageSize: 10, now })).total).toBe(5);
  });

  it("paginates by cursor", async () => {
    const user = await createUser(db);
    for (let i = 0; i < 5; i++)
      await repo.create({ code: `c${i}xx`, destinationUrl: "https://x.example", userId: user.id });
    const first = await repo.listByCursor(user.id, null, 2);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await repo.listByCursor(user.id, first.nextCursor, 2);
    const third = await repo.listByCursor(user.id, second.nextCursor, 2);
    expect(third.items).toHaveLength(1);
    expect(third.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items, ...third.items].map((l) => l.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("updates, enables/disables and soft-deletes", async () => {
    const link = await repo.create({ code: "upd", destinationUrl: "https://x.example" });
    const updated = await repo.update(link.id, { title: "New", maxClicks: 5 });
    expect(updated).toMatchObject({ title: "New", maxClicks: 5 });
    expect(await repo.setEnabled([link.id], false)).toBe(1);
    expect((await repo.findById(link.id))?.isEnabled).toBe(false);
    expect(await repo.softDelete([link.id], now)).toBe(1);
    expect(await repo.findById(link.id)).toBeNull();
    expect(await repo.update(link.id, { title: "x" })).toBeNull();
  });

  it("consumes access atomically: 50 parallel consumes on max_clicks=10 succeed exactly 10 times", async () => {
    const link = await repo.create({ code: "limited", destinationUrl: "https://x.example", maxClicks: 10 });
    const results = await Promise.all(Array.from({ length: 50 }, () => repo.consumeAccess(link.id)));
    expect(results.filter((r) => r !== null)).toHaveLength(10);
    expect((await repo.findById(link.id))?.clickCount).toBe(10);
  });

  it("unlimited links always consume", async () => {
    const link = await repo.create({ code: "unlim", destinationUrl: "https://x.example" });
    for (let i = 0; i < 3; i++) expect(await repo.consumeAccess(link.id)).toBe("https://x.example");
    expect((await repo.findById(link.id))?.clickCount).toBe(3);
  });

  it("claims anonymous links by token hash", async () => {
    const user = await createUser(db);
    const link = await repo.create({
      code: "anon1",
      destinationUrl: "https://x.example",
      claimTokenHash: "h1",
    });
    const found = await repo.findByClaimTokenHashes(["h1", "nope"]);
    expect(found.map((l) => l.id)).toEqual([link.id]);
    expect(await repo.claim([link.id], user.id)).toBe(1);
    expect(await repo.findByClaimTokenHashes(["h1"])).toHaveLength(0);
    expect((await repo.findById(link.id))?.userId).toBe(user.id);
  });

  it("computes overview stats with a zero-filled 30 day series", async () => {
    const user = await createUser(db);
    const link = await repo.create({ code: "ov", destinationUrl: "https://x.example", userId: user.id });
    const base = {
      linkId: link.id,
      visitorHash: "v",
      country: null,
      region: null,
      city: null,
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      deviceType: "desktop" as const,
      referrerHost: null,
      referrerUrl: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
      language: null,
    };
    const realNow = new Date();
    await clicks.record({ ...base, isBot: false, occurredAt: new Date(realNow.getTime() - 60_000) });
    await clicks.record({ ...base, isBot: false, occurredAt: new Date(realNow.getTime() - 10 * 86_400_000) });
    await clicks.record({ ...base, isBot: true, occurredAt: new Date(realNow.getTime() - 60_000) });

    const stats = await repo.overview(user.id, realNow);
    expect(stats.totalLinks).toBe(1);
    expect(stats.clicks7d).toBe(1);
    expect(stats.clicks30d).toBe(2);
    expect(stats.topLinks).toEqual([{ id: link.id, code: "ov", title: null, clicks: 2 }]);
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily.reduce((sum, p) => sum + p.clicks, 0)).toBe(2);
  });
});
