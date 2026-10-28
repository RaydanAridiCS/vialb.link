import { describe, expect, it } from "vitest";
import { LIMITS, RATE_LIMITS } from "@/lib/constants";
import { RateLimitedError, UnauthorizedError, ValidationError } from "@/server/errors";
import type { ImportRowCommand } from "@/server/services/link.service";
import { buildFixture, users } from "../support/fixtures";

const row = (n: number, over: Partial<ImportRowCommand> = {}): ImportRowCommand => ({
  row: n,
  destinationUrl: `https://example.com/${n}`,
  ...over,
});

describe("LinkService.importLinks", () => {
  it("creates every valid row as the importing user, like the form would", async () => {
    const f = buildFixture();
    const results = await f.links.importLinks(users.alice, [
      row(2, { title: " Landing ", tags: ["Promo", "#menus"], customCode: "my-code" }),
      row(3),
    ]);

    expect(results).toEqual([
      { row: 2, status: "created", code: "my-code" },
      { row: 3, status: "created", code: expect.stringMatching(/^.{7}$/) },
    ]);
    const stored = await f.linkRepo.findByCode("my-code");
    expect(stored).toMatchObject({
      userId: "alice",
      title: "Landing",
      tags: ["promo", "menus"],
      destinationUrl: "https://example.com/2",
      passwordHash: null,
      expiresAt: null,
      maxClicks: null,
      isEnabled: true,
      qrFgColor: "#000000",
      qrBgColor: "#FFFFFF",
    });
  });

  it("reports failures per row and still creates the good ones (no rollback)", async () => {
    const f = buildFixture({ blockedDomains: ["blocked.example"] });
    const results = await f.links.importLinks(users.alice, [
      row(2),
      row(3, { destinationUrl: "ftp://nope.example" }),
      row(4, { destinationUrl: "https://blocked.example/x" }),
      row(5, { customCode: "ab" }),
      row(6, { customCode: "dashboard" }),
      row(7, { tags: ["bad;tag"] }),
      row(8, { tags: Array.from({ length: LIMITS.tagsPerLinkMax + 1 }, (_, i) => `t${i}`) }),
      row(9, { title: "x".repeat(LIMITS.titleMax + 1) }),
      row(10, { destinationUrl: `https://example.com/${"a".repeat(LIMITS.urlMaxLength)}` }),
      row(11, { destinationUrl: "https://sho.rt/loop" }),
      row(12),
    ]);

    expect(results.map((r) => [r.row, r.status])).toEqual([
      [2, "created"],
      [3, "failed"],
      [4, "failed"],
      [5, "failed"],
      [6, "failed"],
      [7, "failed"],
      [8, "failed"],
      [9, "failed"],
      [10, "failed"],
      [11, "failed"],
      [12, "created"],
    ]);
    const reason = (n: number) => {
      const r = results.find((x) => x.row === n);
      return r?.status === "failed" ? r.reason : "";
    };
    expect(reason(3)).toMatch(/http/);
    expect(reason(4)).toMatch(/not allowed/);
    expect(reason(5)).toMatch(/3-50/);
    expect(reason(6)).toMatch(/reserved/);
    expect(reason(7)).toMatch(/Tags are up to/);
    expect(reason(8)).toMatch(/at most 10 tags/);
    expect(reason(9)).toMatch(/Title/);
    expect(reason(10)).toMatch(/2048/);
    expect(reason(11)).toMatch(/this instance/);
    expect(f.linkRepo.rows.size).toBe(2);
  });

  it("rejects a custom code taken by someone else, reporting a conflict instead of overwriting", async () => {
    const f = buildFixture();
    await f.links.create(
      users.bob,
      { destinationUrl: "https://bob.example", customCode: "taken" },
      { ip: null },
    );

    const [result] = await f.links.importLinks(users.alice, [row(2, { customCode: "taken" })]);

    expect(result).toMatchObject({
      row: 2,
      status: "failed",
      reason: "This short code is already taken",
      field: "customCode",
    });
    expect((await f.linkRepo.findByCode("taken"))?.userId).toBe("bob");
  });

  it("keeps the code of a deleted link reserved", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://a.example", customCode: "old-one" },
      { ip: null },
    );
    await f.links.delete(users.alice, [link.id]);

    const [result] = await f.links.importLinks(users.alice, [row(2, { customCode: "old-one" })]);

    expect(result?.status).toBe("failed");
  });

  it("is idempotent: re-importing the same code and destination is skipped, a different destination is a conflict", async () => {
    const f = buildFixture();
    const first = await f.links.importLinks(users.alice, [row(2, { customCode: "again" })]);
    const second = await f.links.importLinks(users.alice, [
      row(2, { customCode: "again" }),
      row(3, { customCode: "again", destinationUrl: "https://elsewhere.example" }),
    ]);

    expect(first[0]?.status).toBe("created");
    expect(second[0]).toEqual({ row: 2, status: "skipped", code: "again", reason: "Already imported" });
    expect(second[1]?.status).toBe("failed");
    expect(f.linkRepo.rows.size).toBe(1);
  });

  it("skips a repeated code+destination inside one batch and fails a repeated code with another destination", async () => {
    const f = buildFixture();
    const results = await f.links.importLinks(users.alice, [
      row(2, { customCode: "dupe", destinationUrl: "https://same.example" }),
      row(3, { customCode: "dupe", destinationUrl: "https://same.example" }),
      row(4, { customCode: "dupe", destinationUrl: "https://other.example" }),
    ]);

    expect(results.map((r) => r.status)).toEqual(["created", "skipped", "failed"]);
  });

  it("never touches another user's link, even with an identical code and destination", async () => {
    const f = buildFixture();
    await f.links.create(
      users.bob,
      { destinationUrl: "https://example.com/2", customCode: "shared" },
      { ip: null },
    );

    const [result] = await f.links.importLinks(users.alice, [row(2, { customCode: "shared" })]);

    expect(result?.status).toBe("failed");
    expect(f.linkRepo.rows.size).toBe(1);
  });

  it("rejects anonymous callers", async () => {
    const f = buildFixture({ allowAnonymousLinks: true });
    await expect(f.links.importLinks(users.anon, [row(2)])).rejects.toBeInstanceOf(UnauthorizedError);
    expect(f.linkRepo.rows.size).toBe(0);
  });

  it("rejects empty and oversized batches", async () => {
    const f = buildFixture();
    await expect(f.links.importLinks(users.alice, [])).rejects.toBeInstanceOf(ValidationError);
    const tooMany = Array.from({ length: LIMITS.importBatchSize + 1 }, (_, i) => row(i + 2));
    await expect(f.links.importLinks(users.alice, tooMany)).rejects.toBeInstanceOf(ValidationError);
    const exactly = Array.from({ length: LIMITS.importBatchSize }, (_, i) => row(i + 2));
    expect(await f.links.importLinks(users.alice, exactly)).toHaveLength(LIMITS.importBatchSize);
  });

  it("spends one rate-limit token per batch instead of one per row", async () => {
    const f = buildFixture();
    const batch = Array.from({ length: LIMITS.importBatchSize }, (_, i) => row(i + 2));

    // 60 per hour would stop a single batch of 50 followed by a second one; import has its own budget.
    for (let i = 0; i < RATE_LIMITS.importBatches.limit; i++)
      await f.links.importLinks(users.alice, [row(i + 2)]);
    await expect(f.links.importLinks(users.alice, batch)).rejects.toBeInstanceOf(RateLimitedError);

    // the per-link create limit is a separate budget and still untouched
    await expect(
      f.links.create(users.alice, { destinationUrl: "https://a.example" }, { ip: null }),
    ).resolves.toBeDefined();
    // other users and admins are not affected
    await expect(f.links.importLinks(users.bob, [row(2)])).resolves.toHaveLength(1);
  });

  it("lets the budget refill after the window and exempts admins", async () => {
    const f = buildFixture();
    for (let i = 0; i < RATE_LIMITS.importBatches.limit; i++)
      await f.links.importLinks(users.alice, [row(i + 2)]);
    await expect(f.links.importLinks(users.alice, [row(2)])).rejects.toBeInstanceOf(RateLimitedError);
    await expect(f.links.importLinks(users.admin, [row(2)])).resolves.toHaveLength(1);

    f.clock.advance(RATE_LIMITS.importBatches.windowMs + 1000);

    await expect(f.links.importLinks(users.alice, [row(2)])).resolves.toHaveLength(1);
  });

  it("asks Safe Browsing once per distinct URL in a batch", async () => {
    const seen: string[] = [];
    const f = buildFixture({
      safety: {
        isConfigured: true,
        check: async (url) => {
          seen.push(url);
          return { safe: !url.includes("malware") };
        },
      },
    });

    const results = await f.links.importLinks(users.alice, [
      row(2, { destinationUrl: "https://same.example/a" }),
      row(3, { destinationUrl: "https://same.example/a" }),
      row(4, { destinationUrl: "https://malware.example/x" }),
      row(5, { destinationUrl: "https://malware.example/x" }),
      row(6, { destinationUrl: "https://other.example/" }),
    ]);

    expect(seen.sort()).toEqual([
      "https://malware.example/x",
      "https://other.example/",
      "https://same.example/a",
    ]);
    expect(results.map((r) => r.status)).toEqual(["created", "created", "failed", "failed", "created"]);
    expect(results[2]).toMatchObject({ reason: "This URL was flagged as unsafe" });
  });

  it("does not leak internal errors into a row's reason", async () => {
    const f = buildFixture();
    f.linkRepo.create = async () => {
      throw new Error("connection to 10.0.0.5:5432 refused");
    };

    const [result] = await f.links.importLinks(users.alice, [row(2)]);

    expect(result).toEqual({ row: 2, status: "failed", reason: "Could not create this link" });
  });

  it("keeps the row number the caller sent", async () => {
    const f = buildFixture();
    const results = await f.links.importLinks(users.alice, [row(907), row(3)]);
    expect(results.map((r) => r.row)).toEqual([907, 3]);
  });
});

describe("LinkService.checkImportCodes", () => {
  it("separates codes taken by others/deleted links from identical ones the user already has", async () => {
    const f = buildFixture();
    await f.links.create(
      users.alice,
      { destinationUrl: "https://mine.example", customCode: "mine" },
      { ip: null },
    );
    await f.links.create(
      users.alice,
      { destinationUrl: "https://other.example", customCode: "mine-diff" },
      { ip: null },
    );
    await f.links.create(
      users.bob,
      { destinationUrl: "https://mine.example", customCode: "bobs" },
      { ip: null },
    );
    const gone = await f.links.create(
      users.alice,
      { destinationUrl: "https://gone.example", customCode: "removed" },
      { ip: null },
    );
    await f.links.delete(users.alice, [gone.link.id]);

    const result = await f.links.checkImportCodes(users.alice, [
      { code: "mine", destinationUrl: "https://mine.example" },
      { code: "mine-diff", destinationUrl: "https://mine.example" },
      { code: "bobs", destinationUrl: "https://mine.example" },
      { code: "removed", destinationUrl: "https://gone.example" },
      { code: "free", destinationUrl: "https://mine.example" },
    ]);

    expect(result.existing).toEqual(["mine"]);
    expect(result.taken.sort()).toEqual(["bobs", "mine-diff", "removed"]);
  });

  it("requires a signed-in user and bounds the request size", async () => {
    const f = buildFixture();
    await expect(f.links.checkImportCodes(users.anon, [])).rejects.toBeInstanceOf(UnauthorizedError);
    const tooMany = Array.from({ length: LIMITS.importMaxRows + 1 }, (_, i) => ({
      code: `c${i}`,
      destinationUrl: "https://a.example",
    }));
    await expect(f.links.checkImportCodes(users.alice, tooMany)).rejects.toBeInstanceOf(ValidationError);
  });
});
