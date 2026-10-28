import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";
import { buildFixture, users } from "../support/fixtures";

describe("LinkService.create", () => {
  it("creates a link with a generated 7-char code and DTO fields", async () => {
    const f = buildFixture();
    const { link, claimToken } = await f.links.create(
      users.alice,
      { destinationUrl: " https://example.com/page ", title: " Hello " },
      { ip: "1.1.1.1" },
    );
    expect(claimToken).toBeNull();
    expect(link.code).toHaveLength(7);
    expect(link.shortUrl).toBe(`https://sho.rt/${link.code}`);
    expect(link).toMatchObject({
      destinationUrl: "https://example.com/page",
      title: "Hello",
      hasPassword: false,
      status: "active",
      ownerId: "alice",
      expiresAt: null,
      maxClicks: null,
    });
  });

  it("always creates a new link for the same destination (no dedupe)", async () => {
    const f = buildFixture();
    const a = await f.links.create(users.alice, { destinationUrl: "https://example.com" }, { ip: null });
    const b = await f.links.create(users.alice, { destinationUrl: "https://example.com" }, { ip: null });
    expect(a.link.id).not.toBe(b.link.id);
    expect(a.link.code).not.toBe(b.link.code);
  });

  it("retries on collisions and grows the code length after 5 failures", async () => {
    const f = buildFixture();
    await f.linkRepo.create({ code: "AAAAAAA", destinationUrl: "https://x.example" });
    f.codes.queue.push(...Array.from({ length: 5 }, () => "AAAAAAA"));
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://example.com" },
      { ip: null },
    );
    expect(f.codes.lengths).toEqual([7, 7, 7, 7, 7, 8]);
    expect(link.code).toHaveLength(8);
  });

  it("supports custom codes and returns a conflict when taken (even if soft-deleted)", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://a.example", customCode: "My-Code" },
      { ip: null },
    );
    expect(link.code).toBe("My-Code");
    await expect(
      f.links.create(users.bob, { destinationUrl: "https://b.example", customCode: "My-Code" }, { ip: null }),
    ).rejects.toBeInstanceOf(ConflictError);
    // codes are case-sensitive
    await expect(
      f.links.create(users.bob, { destinationUrl: "https://b.example", customCode: "my-code" }, { ip: null }),
    ).resolves.toBeDefined();
    await f.links.delete(users.alice, [link.id]);
    await expect(
      f.links.create(users.bob, { destinationUrl: "https://b.example", customCode: "My-Code" }, { ip: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects reserved and malformed custom codes", async () => {
    const f = buildFixture();
    for (const code of ["api", "Admin", "ab", "bad code"]) {
      await expect(
        f.links.create(users.alice, { destinationUrl: "https://a.example", customCode: code }, { ip: null }),
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("rejects non-http schemes, self links, credentials, blocked and unsafe domains", async () => {
    const f = buildFixture({
      blockedDomains: ["evil.example"],
      safety: {
        isConfigured: true,
        check: async (url) => ({ safe: !url.includes("malware"), reason: "MALWARE" }),
      },
    });
    const bad = [
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://sho.rt/abc",
      "https://www.sho.rt/abc",
      "https://user:pass@example.com",
      "https://evil.example",
      "https://cdn.evil.example/x",
      "https://malware.example",
    ];
    for (const destinationUrl of bad) {
      await expect(f.links.create(users.alice, { destinationUrl }, { ip: null })).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
  });

  it("hashes passwords, resolves expiry with the clock and stores limits", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://a.example", password: "secret", expiration: { preset: "1h" }, maxClicks: 3 },
      { ip: null },
    );
    expect(link.hasPassword).toBe(true);
    expect(link.expiresAt).toBe("2026-06-01T13:00:00.000Z");
    expect(link.maxClicks).toBe(3);
    expect(f.linkRepo.rows.get(link.id)?.passwordHash).toBe("plain:secret");
  });

  it("requires https OG images", async () => {
    const f = buildFixture();
    await expect(
      f.links.create(
        users.alice,
        { destinationUrl: "https://a.example", ogImageUrl: "http://x/a.png" },
        { ip: null },
      ),
    ).rejects.toThrow(/https/);
    await expect(
      f.links.create(users.alice, { destinationUrl: "https://a.example", ogImageUrl: "nope" }, { ip: null }),
    ).rejects.toThrow(/https/);
  });

  it("rate limits regular users", async () => {
    const f = buildFixture();
    for (let i = 0; i < 60; i++)
      await f.links.create(users.alice, { destinationUrl: "https://a.example" }, { ip: null });
    await expect(
      f.links.create(users.alice, { destinationUrl: "https://a.example" }, { ip: null }),
    ).rejects.toBeInstanceOf(RateLimitedError);
    // admins are exempt
    await expect(
      f.links.create(users.admin, { destinationUrl: "https://a.example" }, { ip: null }),
    ).resolves.toBeDefined();
  });
});

describe("anonymous creation", () => {
  it("is rejected when disabled", async () => {
    const f = buildFixture({ allowAnonymousLinks: false });
    await expect(
      f.links.create(users.anon, { destinationUrl: "https://a.example" }, { ip: "203.0.113.7" }),
    ).rejects.toThrow(/disabled/);
  });

  it("forces the TTL, returns a claim token and stores a hashed IP", async () => {
    const f = buildFixture({ allowAnonymousLinks: true });
    const { link, claimToken } = await f.links.create(
      users.anon,
      { destinationUrl: "https://a.example", expiration: { preset: "30d" } },
      { ip: "203.0.113.7" },
    );
    expect(claimToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(link.ownerId).toBeNull();
    expect(link.expiresAt).toBe("2026-06-02T12:00:00.000Z"); // capped to 24h TTL
    const row = f.linkRepo.rows.get(link.id);
    expect(row?.createdIpHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.createdIpHash).not.toContain("203.0");
  });

  it("forbids passwords and custom codes, enforces captcha and a stricter rate limit", async () => {
    const f = buildFixture({
      allowAnonymousLinks: true,
      captcha: { isEnabled: true, siteKey: "k", verify: async (token) => token === "ok" },
    });
    const ctx = { ip: "203.0.113.7", captchaToken: "ok" };
    await expect(
      f.links.create(users.anon, { destinationUrl: "https://a.example", password: "abcd" }, ctx),
    ).rejects.toThrow(/Sign in/);
    await expect(
      f.links.create(users.anon, { destinationUrl: "https://a.example", customCode: "mine" }, ctx),
    ).rejects.toThrow(/Sign in/);
    await expect(
      f.links.create(
        users.anon,
        { destinationUrl: "https://a.example" },
        { ip: "203.0.113.7", captchaToken: "bad" },
      ),
    ).rejects.toThrow(/Captcha/);
    for (let i = 0; i < 10; i++)
      await f.links.create(users.anon, { destinationUrl: "https://a.example" }, ctx);
    await expect(
      f.links.create(users.anon, { destinationUrl: "https://a.example" }, ctx),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("lets a user claim anonymous links once", async () => {
    const f = buildFixture({ allowAnonymousLinks: true });
    const { link, claimToken } = await f.links.create(
      users.anon,
      { destinationUrl: "https://a.example" },
      { ip: "1.2.3.4" },
    );
    expect(await f.links.claim(users.alice, [claimToken ?? "", "x".repeat(20)])).toBe(1);
    expect(await f.links.claim(users.bob, [claimToken ?? ""])).toBe(0);
    expect((await f.links.get(users.alice, link.id)).ownerId).toBe("alice");
    await expect(f.links.claim(users.anon, [claimToken ?? ""])).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("LinkService management + authorization", () => {
  async function setup() {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://a.example", password: "pw12" },
      { ip: null },
    );
    return { f, link };
  }

  it("only owners and admins can read, edit, disable and delete", async () => {
    const { f, link } = await setup();
    await expect(f.links.get(users.bob, link.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(f.links.update(users.bob, link.id, { title: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(f.links.delete(users.bob, [link.id])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(f.links.setEnabled(users.bob, [link.id], false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(f.links.get(users.anon, link.id)).rejects.toBeInstanceOf(UnauthorizedError);
    expect((await f.links.get(users.admin, link.id)).id).toBe(link.id);
    await expect(f.links.get(users.alice, "00000000-0000-7000-8000-000000000000")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("edits fields, password and expiration; the code is immutable", async () => {
    const { f, link } = await setup();
    const updated = await f.links.update(users.alice, link.id, {
      destinationUrl: "https://b.example",
      title: "  ",
      expiration: { preset: "7d" },
      maxClicks: 10,
      password: null,
      isEnabled: false,
      ogTitle: "OG",
      qrFgColor: "#112233",
    });
    expect(updated).toMatchObject({
      code: link.code,
      destinationUrl: "https://b.example",
      title: null,
      hasPassword: false,
      maxClicks: 10,
      isEnabled: false,
      status: "disabled",
      ogTitle: "OG",
      qrFgColor: "#112233",
      expiresAt: "2026-06-08T12:00:00.000Z",
    });
    const withPw = await f.links.update(users.alice, link.id, { password: "newpass" });
    expect(withPw.hasPassword).toBe(true);
    await expect(
      f.links.update(users.alice, link.id, { destinationUrl: "javascript:x" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("bulk disables and soft-deletes", async () => {
    const { f, link } = await setup();
    const other = (await f.links.create(users.alice, { destinationUrl: "https://c.example" }, { ip: null }))
      .link;
    expect(await f.links.setEnabled(users.alice, [link.id, other.id], false)).toBe(2);
    expect(await f.links.delete(users.alice, [link.id, other.id, link.id])).toBe(2);
    await expect(f.links.get(users.alice, link.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(f.links.delete(users.alice, [])).rejects.toBeInstanceOf(ValidationError);
  });

  it("lists own links; admins can list all", async () => {
    const { f } = await setup();
    await f.links.create(users.bob, { destinationUrl: "https://b.example" }, { ip: null });
    expect((await f.links.list(users.alice, {})).total).toBe(1);
    expect((await f.links.list(users.admin, { scope: "all" })).total).toBe(2);
    expect((await f.links.list(users.alice, { scope: "all" })).total).toBe(1);
    expect((await f.links.list(users.alice, { status: "protected" })).total).toBe(1);
    const cursor = await f.links.listByCursor(users.alice, null, 10);
    expect(cursor.items).toHaveLength(1);
    expect((await f.links.exportForUser(users.alice))[0]?.ownerId).toBe("alice");
    expect((await f.links.overview(users.alice)).totalLinks).toBe(1);
  });
});
