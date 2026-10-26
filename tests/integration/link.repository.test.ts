import { sql } from "drizzle-orm";
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

  it("stores tags, filters by tag and lists distinct tags per owner", async () => {
    const alice = (await createUser(db)).id;
    const bob = (await createUser(db)).id;
    await repo.create({
      code: "t1",
      destinationUrl: "https://x.example",
      userId: alice,
      tags: ["promo", "menus"],
    });
    await repo.create({ code: "t2", destinationUrl: "https://x.example", userId: alice, tags: ["promo"] });
    await repo.create({ code: "t3", destinationUrl: "https://x.example", userId: alice });
    const gone = await repo.create({
      code: "t4",
      destinationUrl: "https://x.example",
      userId: alice,
      tags: ["deleted"],
    });
    await repo.create({ code: "t5", destinationUrl: "https://x.example", userId: bob, tags: ["bob-only"] });
    await repo.softDelete([gone.id], now);

    const query = { page: 1, pageSize: 20, now, userId: alice };
    expect((await repo.list({ ...query, tag: "promo" })).total).toBe(2);
    expect((await repo.list({ ...query, tag: "menus" })).items.map((l) => l.code)).toEqual(["t1"]);
    expect((await repo.list({ ...query, tag: "bob-only" })).total).toBe(0);
    expect((await repo.findByCode("t3"))?.tags).toEqual([]);

    expect(await repo.listTags(alice)).toEqual(["menus", "promo"]);
    expect(await repo.listTags(undefined)).toEqual(["bob-only", "menus", "promo"]);

    const first = await repo.findByCode("t1");
    if (!first) throw new Error("expected link t1");
    expect((await repo.update(first.id, { tags: ["replaced"] }))?.tags).toEqual(["replaced"]);
  });

  describe("tag filtering", () => {
    const url = "https://x.example";

    it("matches whole tags only, never substrings", async () => {
      const user = (await createUser(db)).id;
      await repo.create({ code: "w1", destinationUrl: url, userId: user, tags: ["promo"] });
      await repo.create({ code: "w2", destinationUrl: url, userId: user, tags: ["promotion", "pro"] });

      const query = { page: 1, pageSize: 20, now, userId: user };
      expect((await repo.list({ ...query, tag: "pro" })).items.map((l) => l.code)).toEqual(["w2"]);
      expect((await repo.list({ ...query, tag: "promo" })).items.map((l) => l.code)).toEqual(["w1"]);
    });

    it("combines tag, search and status filters", async () => {
      const user = (await createUser(db)).id;
      await repo.create({
        code: "spring-a",
        destinationUrl: url,
        userId: user,
        title: "Spring sale",
        tags: ["promo"],
      });
      await repo.create({
        code: "spring-b",
        destinationUrl: url,
        userId: user,
        title: "Spring menu",
        tags: ["promo"],
        isEnabled: false,
      });
      await repo.create({ code: "spring-c", destinationUrl: url, userId: user, tags: ["menus"] });
      await repo.create({ code: "autumn", destinationUrl: url, userId: user, tags: ["promo"] });

      const query = { page: 1, pageSize: 20, now, userId: user };
      const codes = async (extra: object) =>
        (await repo.list({ ...query, ...extra })).items.map((l) => l.code);

      expect((await codes({ tag: "promo", search: "spring" })).sort()).toEqual(["spring-a", "spring-b"]);
      expect(await codes({ tag: "promo", search: "spring", status: "active" })).toEqual(["spring-a"]);
      expect(await codes({ tag: "promo", search: "spring", status: "disabled" })).toEqual(["spring-b"]);
      expect(await codes({ tag: "menus", status: "disabled" })).toEqual([]);
      const filtered = await repo.list({ ...query, tag: "promo", pageSize: 1 });
      expect(filtered.total).toBe(3);
      expect(filtered.items).toHaveLength(1);
    });

    it("never returns soft-deleted links and keeps their tags out of listTags", async () => {
      const user = (await createUser(db)).id;
      const gone = await repo.create({ code: "g1", destinationUrl: url, userId: user, tags: ["only-here"] });
      await repo.create({ code: "g2", destinationUrl: url, userId: user, tags: ["kept"] });
      await repo.softDelete([gone.id], now);

      expect((await repo.list({ page: 1, pageSize: 20, now, userId: user, tag: "only-here" })).total).toBe(0);
      expect(await repo.listTags(user)).toEqual(["kept"]);
      expect(await repo.listTags(undefined)).toEqual(["kept"]);
    });

    it("lists across owners in admin scope, including anonymous links, and keeps users isolated otherwise", async () => {
      const alice = (await createUser(db)).id;
      const bob = (await createUser(db)).id;
      await repo.create({ code: "a1", destinationUrl: url, userId: alice, tags: ["shared"] });
      await repo.create({ code: "b1", destinationUrl: url, userId: bob, tags: ["shared"] });
      await repo.create({ code: "n1", destinationUrl: url, tags: ["shared", "anon"] });

      const all = { page: 1, pageSize: 20, now, tag: "shared" };
      expect((await repo.list(all)).items.map((l) => l.code).sort()).toEqual(["a1", "b1", "n1"]);
      expect((await repo.list({ ...all, userId: alice })).items.map((l) => l.code)).toEqual(["a1"]);
      expect(await repo.listTags(undefined)).toEqual(["anon", "shared"]);
      expect(await repo.listTags(bob)).toEqual(["shared"]);
    });

    it("has a GIN index on tags that the containment filter can use", async () => {
      const [index] = await db.execute<{ indexdef: string }>(
        sql`select indexdef from pg_indexes where tablename = 'links' and indexname = 'links_tags_idx'`,
      );
      expect(index?.indexdef).toMatch(/USING gin \(tags\)/i);

      const plan = await db.transaction(async (tx) => {
        // A near-empty table prefers a seq scan; forbid it to prove the index is applicable.
        await tx.execute(sql`set local enable_seqscan = off`);
        return tx.execute<{ "QUERY PLAN": string }>(
          sql`explain select id from links where tags @> array['promo']::text[]`,
        );
      });
      expect(plan.map((row) => row["QUERY PLAN"]).join("\n")).toContain("links_tags_idx");
    });

    it("defaults to an empty tag array and survives a null-free round trip", async () => {
      const user = (await createUser(db)).id;
      const created = await repo.create({ code: "e1", destinationUrl: url, userId: user });
      expect(created.tags).toEqual([]);
      const updated = await repo.update(created.id, { tags: [] });
      expect(updated?.tags).toEqual([]);
    });
  });

  describe("QR options", () => {
    it("defaults to M, no frame and no badge text", async () => {
      const link = await repo.create({ code: "qr-default", destinationUrl: "https://x.example" });
      expect(link).toMatchObject({ qrEcc: "M", qrFrame: "none", qrFrameText: null });
    });

    it("stores and updates the design", async () => {
      const link = await repo.create({
        code: "qr-set",
        destinationUrl: "https://x.example",
        qrEcc: "H",
        qrFrame: "badge",
        qrFrameText: "Menu",
      });
      expect(await repo.findById(link.id)).toMatchObject({
        qrEcc: "H",
        qrFrame: "badge",
        qrFrameText: "Menu",
      });

      const updated = await repo.update(link.id, { qrEcc: "L", qrFrame: "none", qrFrameText: null });
      expect(updated).toMatchObject({ qrEcc: "L", qrFrame: "none", qrFrameText: null });
    });
  });

  describe("import support", () => {
    it("reports code holders case-sensitively, including soft-deleted links", async () => {
      const alice = (await createUser(db)).id;
      const live = await repo.create({ code: "Live1", destinationUrl: "https://a.example", userId: alice });
      const dead = await repo.create({ code: "dead1", destinationUrl: "https://b.example", userId: alice });
      await repo.softDelete([dead.id], now);

      const holders = await repo.findCodeHolders(["Live1", "live1", "dead1", "nobody"]);

      expect(holders.map((h) => h.code).sort()).toEqual(["Live1", "dead1"]);
      expect(holders.find((h) => h.code === "Live1")).toMatchObject({
        userId: alice,
        destinationUrl: "https://a.example",
        deletedAt: null,
      });
      expect(holders.find((h) => h.code === "dead1")?.deletedAt).toBeInstanceOf(Date);
      expect(live.code).toBe("Live1");
      expect(await repo.findCodeHolders([])).toEqual([]);
    });

    it("lets the unique constraint decide when many rows claim one code at once", async () => {
      const user = (await createUser(db)).id;
      const attempts = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          repo.create({ code: "race-me", destinationUrl: `https://x.example/${i}`, userId: user }),
        ),
      );

      expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
      const rejected = attempts.filter((a): a is PromiseRejectedResult => a.status === "rejected");
      expect(rejected).toHaveLength(11);
      for (const failure of rejected) expect(failure.reason).toBeInstanceOf(UniqueViolationError);
    });

    it("stores a full import-sized batch of tagged links", async () => {
      const user = (await createUser(db)).id;
      for (let i = 0; i < 50; i++) {
        await repo.create({
          code: `bulk-${i}`,
          destinationUrl: `https://x.example/${i}`,
          userId: user,
          title: i % 2 === 0 ? `Title ${i}` : null,
          tags: i % 5 === 0 ? ["imported", "five"] : ["imported"],
        });
      }

      const page = await repo.list({ page: 1, pageSize: 100, now, userId: user, tag: "imported" });
      expect(page.total).toBe(50);
      expect((await repo.list({ page: 1, pageSize: 100, now, userId: user, tag: "five" })).total).toBe(10);
    });
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
