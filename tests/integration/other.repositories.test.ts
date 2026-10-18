import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { UniqueViolationError } from "@/server/errors";
import { DrizzleApiKeyRepository } from "@/server/repositories/drizzle/api-key.repository.drizzle";
import { DrizzleSettingsRepository } from "@/server/repositories/drizzle/settings.repository.drizzle";
import { DrizzleUserRepository } from "@/server/repositories/drizzle/user.repository.drizzle";
import { connect, createUser, truncateAll } from "./helpers";

const { db, close } = connect();

afterAll(close);
beforeEach(() => truncateAll(db));

describe("DrizzleApiKeyRepository", () => {
  const repo = new DrizzleApiKeyRepository(db);

  it("creates, finds, touches and revokes keys", async () => {
    const user = await createUser(db);
    const key = await repo.create({ userId: user.id, name: "CI", prefix: "tw_abcdefgh", hash: "deadbeef" });
    await expect(
      repo.create({ userId: user.id, name: "dup", prefix: "tw_abcdefgh", hash: "x" }),
    ).rejects.toBeInstanceOf(UniqueViolationError);
    expect(await repo.findActiveByPrefix("tw_abcdefgh")).toMatchObject({ id: key.id });
    const at = new Date("2026-05-05T00:00:00Z");
    await repo.touch(key.id, at);
    expect((await repo.listByUser(user.id))[0]?.lastUsedAt).toEqual(at);

    const other = await createUser(db);
    expect(await repo.revoke(key.id, other.id, at)).toBe(false);
    expect(await repo.revoke(key.id, user.id, at)).toBe(true);
    expect(await repo.revoke(key.id, user.id, at)).toBe(false);
    expect(await repo.findActiveByPrefix("tw_abcdefgh")).toBeNull();
  });
});

describe("DrizzleSettingsRepository", () => {
  const repo = new DrizzleSettingsRepository(db);

  it("upserts the single settings row", async () => {
    expect(await repo.get()).toBeNull();
    await repo.upsert({ allowAnonymousLinks: true });
    await repo.upsert({ blockedDomains: ["evil.example"] });
    expect(await repo.get()).toEqual({
      allowAnonymousLinks: true,
      allowSignups: null,
      anonLinkTtlHours: null,
      blockedDomains: ["evil.example"],
    });
    await repo.upsert({ allowAnonymousLinks: null });
    expect((await repo.get())?.allowAnonymousLinks).toBeNull();
  });

  it("keeps the first daily salt under concurrency", async () => {
    const results = await Promise.all(
      ["a", "b", "c", "d"].map((s) => repo.getOrCreateDailySalt("2026-01-01", s)),
    );
    expect(new Set(results).size).toBe(1);
    expect(await repo.getOrCreateDailySalt("2026-01-02", "z")).toBe("z");
  });
});

describe("DrizzleUserRepository", () => {
  const repo = new DrizzleUserRepository(db);

  it("counts and finds users", async () => {
    expect(await repo.count()).toBe(0);
    const admin = await createUser(db, { role: "admin", email: "Admin@Example.com" });
    await createUser(db);
    expect(await repo.count()).toBe(2);
    expect((await repo.findByEmail("admin@example.com"))?.id).toBe(admin.id);
    expect((await repo.findById(admin.id))?.role).toBe("admin");
    expect((await repo.findFirstAdmin())?.id).toBe(admin.id);
  });
});
