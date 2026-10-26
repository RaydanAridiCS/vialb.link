import { describe, expect, it } from "vitest";
import { LIMITS } from "@/lib/constants";
import type { Actor } from "@/server/domain/types";
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";
import type { SaveBioProfileCommand } from "@/server/services/bio.service";
import { buildFixture, users } from "../support/fixtures";

const BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function profile(overrides: Partial<SaveBioProfileCommand> = {}): SaveBioProfileCommand {
  return {
    handle: "alice",
    displayName: "Alice",
    bio: "Maker of things",
    avatarUrl: null,
    theme: "paper",
    socials: [],
    showBadge: true,
    isPublished: true,
    ...overrides,
  };
}

function setup(options: Parameters<typeof buildFixture>[0] = {}) {
  const f = buildFixture(options);
  for (const [id, role] of [
    ["alice", "user"],
    ["bob", "user"],
    ["root", "admin"],
  ] as const) {
    f.userRepo.rows.push({ id, email: `${id}@example.com`, name: id, role, banned: false });
  }
  return f;
}

async function withPage(f: ReturnType<typeof setup>, actor: Actor = users.alice, handle = "alice") {
  await f.bio.saveProfile(actor, profile({ handle }));
}

describe("BioService.saveProfile", () => {
  it("creates a page and normalizes the handle", async () => {
    const f = setup();
    const saved = await f.bio.saveProfile(users.alice, profile({ handle: "  @Alice_01 " }));
    expect(saved).toMatchObject({
      handle: "alice_01",
      displayName: "Alice",
      isPublished: true,
      pageUrl: "https://sho.rt/@alice_01",
    });
    expect((await f.bio.getEditor(users.alice)).profile?.handle).toBe("alice_01");
  });

  it("is for signed-in users only", async () => {
    const f = setup();
    await expect(f.bio.saveProfile(users.anon, profile())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it.each(["ab", "has space", "admin", "u", "support"])("rejects the handle %s", async (handle) => {
    const f = setup();
    await expect(f.bio.saveProfile(users.alice, profile({ handle }))).rejects.toMatchObject({
      details: { field: "handle" },
    });
  });

  it("reports a handle held by someone else, but lets owners keep their own", async () => {
    const f = setup();
    await withPage(f);
    await expect(f.bio.saveProfile(users.bob, profile({ handle: "Alice" }))).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(f.bio.saveProfile(users.alice, profile({ displayName: "Alice B." }))).resolves.toMatchObject(
      {
        displayName: "Alice B.",
      },
    );
  });

  it("answers handle availability for the form", async () => {
    const f = setup();
    await withPage(f);
    expect(await f.bio.checkHandle(users.alice, "alice")).toEqual({ available: true });
    expect(await f.bio.checkHandle(users.bob, "alice")).toEqual({
      available: false,
      reason: "This handle is taken",
    });
    expect(await f.bio.checkHandle(users.bob, "api")).toMatchObject({ available: false });
    expect(await f.bio.checkHandle(users.bob, "bobby")).toEqual({ available: true });
  });

  it("limits how often a handle can change, but not other edits", async () => {
    const f = setup();
    for (let i = 0; i < 5; i++) await f.bio.saveProfile(users.alice, profile({ handle: `alice${i}` }));
    await expect(f.bio.saveProfile(users.alice, profile({ handle: "alice9" }))).rejects.toBeInstanceOf(
      RateLimitedError,
    );
    await expect(
      f.bio.saveProfile(users.alice, profile({ handle: "alice4", displayName: "Still works" })),
    ).resolves.toBeDefined();
  });

  it("does not spend the handle budget on saves that fail validation", async () => {
    const f = setup();
    for (let i = 0; i < 10; i++) {
      await expect(
        f.bio.saveProfile(users.alice, profile({ avatarUrl: "http://insecure.example/a.png" })),
      ).rejects.toMatchObject({ details: { field: "avatarUrl" } });
    }
    await expect(f.bio.saveProfile(users.alice, profile())).resolves.toBeDefined();
  });

  it("frees the old handle when it changes", async () => {
    const f = setup();
    await withPage(f);
    await f.bio.saveProfile(users.alice, profile({ handle: "alice2" }));
    await expect(f.bio.saveProfile(users.bob, profile({ handle: "alice" }))).resolves.toMatchObject({
      handle: "alice",
    });
  });

  it("validates text, picture and theme", async () => {
    const f = setup();
    await expect(
      f.bio.saveProfile(users.alice, profile({ displayName: "x".repeat(LIMITS.bioDisplayNameMax + 1) })),
    ).rejects.toMatchObject({ details: { field: "displayName" } });
    await expect(
      f.bio.saveProfile(users.alice, profile({ bio: "x".repeat(LIMITS.bioTextMax + 1) })),
    ).rejects.toMatchObject({ details: { field: "bio" } });
    for (const avatarUrl of [
      "http://a.example/p.png",
      "javascript:alert(1)",
      "not a url",
      "https://u:p@a.example/x",
    ]) {
      await expect(f.bio.saveProfile(users.alice, profile({ avatarUrl }))).rejects.toMatchObject({
        details: { field: "avatarUrl" },
      });
    }
    await expect(
      f.bio.saveProfile(users.alice, profile({ theme: "orange" as unknown as "paper" })),
    ).rejects.toMatchObject({ details: { field: "theme" } });
  });

  it("counts characters, not UTF-16 units, for the bio limit", async () => {
    const f = setup();
    await expect(
      f.bio.saveProfile(users.alice, profile({ bio: "🙂".repeat(LIMITS.bioTextMax) })),
    ).resolves.toBeDefined();
  });

  it("trims empty text to null", async () => {
    const f = setup();
    const saved = await f.bio.saveProfile(
      users.alice,
      profile({ displayName: "   ", bio: "", avatarUrl: " " }),
    );
    expect(saved).toMatchObject({ displayName: null, bio: null, avatarUrl: null });
  });

  it("normalizes social links, drops duplicates and keeps them on the platform's own host", async () => {
    const f = setup();
    const saved = await f.bio.saveProfile(
      users.alice,
      profile({
        socials: [
          { platform: "instagram", value: "@alice" },
          { platform: "instagram", value: "https://instagram.com/alice" },
          { platform: "email", value: "me@example.com" },
          { platform: "website", value: "example.com/me" },
        ],
      }),
    );
    expect(saved.socials).toEqual([
      { platform: "instagram", url: "https://instagram.com/alice" },
      { platform: "email", url: "mailto:me@example.com" },
      { platform: "website", url: "https://example.com/me" },
    ]);
    await expect(
      f.bio.saveProfile(
        users.alice,
        profile({ socials: [{ platform: "spotify", value: "https://evil.example/x" }] }),
      ),
    ).rejects.toMatchObject({ details: { field: "socials" } });
    await expect(
      f.bio.saveProfile(users.alice, profile({ socials: [{ platform: "myspace", value: "tom" }] })),
    ).rejects.toMatchObject({ details: { field: "socials" } });
    await expect(
      f.bio.saveProfile(
        users.alice,
        profile({
          socials: Array.from({ length: LIMITS.bioSocialsMax + 1 }, (_, i) => ({
            platform: "website",
            value: `https://site${i}.example`,
          })),
        }),
      ),
    ).rejects.toMatchObject({ details: { field: "socials" } });
  });

  it("runs a personal website through the destination checks", async () => {
    const f = setup({ blockedDomains: ["bad.example"] });
    await expect(
      f.bio.saveProfile(
        users.alice,
        profile({ socials: [{ platform: "website", value: "https://bad.example" }] }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("BioService buttons", () => {
  it("needs a page first", async () => {
    const f = setup();
    await expect(
      f.bio.addButton(users.alice, { label: "Shop", url: "https://shop.example" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("creates a hidden link behind each button and keeps buttons in order", async () => {
    const f = setup();
    await withPage(f);
    const shop = await f.bio.addButton(users.alice, { label: "  Shop ", url: "https://shop.example/x" });
    const blog = await f.bio.addButton(users.alice, { label: "Blog", url: "https://blog.example" });
    expect(shop).toMatchObject({ label: "Shop", position: 0, isVisible: true });
    expect(shop.link).toMatchObject({
      destinationUrl: "https://shop.example/x",
      status: "active",
      clickCount: 0,
    });
    expect(blog.position).toBe(1);

    const editor = await f.bio.getEditor(users.alice);
    expect(editor.buttons.map((b) => b.label)).toEqual(["Shop", "Blog"]);
    const stored = await f.linkRepo.findById(shop.link.id);
    expect(stored).toMatchObject({ kind: "bio_button", userId: "alice", title: "Shop" });
  });

  it("keeps bio buttons out of the links list, tags, API cursor and totals, but not out of the export or admin view", async () => {
    const f = setup();
    await withPage(f);
    await f.links.create(users.alice, { destinationUrl: "https://normal.example" }, { ip: null });
    await f.bio.addButton(users.alice, { label: "Shop", url: "https://shop.example" });

    expect((await f.links.list(users.alice, {})).items.map((l) => l.destinationUrl)).toEqual([
      "https://normal.example",
    ]);
    expect((await f.links.listByCursor(users.alice, null, 10)).items).toHaveLength(1);
    expect((await f.links.overview(users.alice)).totalLinks).toBe(1);
    expect(await f.links.exportForUser(users.alice)).toHaveLength(2);
    expect((await f.links.list(users.admin, { scope: "all" })).items).toHaveLength(2);
    expect((await f.links.list(users.admin, { scope: "mine" })).items).toHaveLength(0);
  });

  it("does not spend the ordinary link-creation budget", async () => {
    const f = setup();
    await withPage(f);
    for (let i = 0; i < 30; i++) {
      await f.bio.addButton(users.alice, { label: `B${i}`, url: `https://b${i}.example` });
    }
    // 60 ordinary links an hour are still available.
    for (let i = 0; i < 60; i++) {
      await f.links.create(users.alice, { destinationUrl: `https://n${i}.example` }, { ip: null });
    }
    await expect(
      f.links.create(users.alice, { destinationUrl: "https://one-too-many.example" }, { ip: null }),
    ).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("limits buttons per page and validates labels and destinations", async () => {
    const f = setup({ blockedDomains: ["bad.example"] });
    await withPage(f);
    await expect(
      f.bio.addButton(users.alice, { label: "  ", url: "https://a.example" }),
    ).rejects.toMatchObject({
      details: { field: "label" },
    });
    await expect(
      f.bio.addButton(users.alice, {
        label: "x".repeat(LIMITS.bioButtonLabelMax + 1),
        url: "https://a.example",
      }),
    ).rejects.toMatchObject({ details: { field: "label" } });
    await expect(
      f.bio.addButton(users.alice, { label: "Bad", url: "https://bad.example" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      f.bio.addButton(users.alice, { label: "Bad", url: "javascript:alert(1)" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await f.bio.getEditor(users.alice)).buttons).toHaveLength(0);

    for (let i = 0; i < LIMITS.bioButtonsMax; i++) {
      await f.bio.addButton(users.alice, { label: `B${i}`, url: `https://b${i}.example` });
    }
    await expect(
      f.bio.addButton(users.alice, { label: "More", url: "https://more.example" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("updates label, destination and visibility; the link follows", async () => {
    const f = setup({ blockedDomains: ["bad.example"] });
    await withPage(f);
    const button = await f.bio.addButton(users.alice, { label: "Shop", url: "https://shop.example" });

    const renamed = await f.bio.updateButton(users.alice, button.id, {
      label: "Store",
      url: "https://store.example",
    });
    expect(renamed).toMatchObject({ label: "Store", link: { destinationUrl: "https://store.example" } });
    expect(await f.linkRepo.findById(button.link.id)).toMatchObject({
      title: "Store",
      destinationUrl: "https://store.example",
    });

    const hidden = await f.bio.updateButton(users.alice, button.id, { isVisible: false });
    expect(hidden).toMatchObject({ isVisible: false, label: "Store" });

    await expect(
      f.bio.updateButton(users.alice, button.id, { url: "https://bad.example" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("never lets another user touch a button", async () => {
    const f = setup();
    await withPage(f);
    const button = await f.bio.addButton(users.alice, { label: "Shop", url: "https://shop.example" });
    await expect(f.bio.updateButton(users.bob, button.id, { label: "Mine now" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(f.bio.removeButton(users.bob, button.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(f.bio.reorderButtons(users.bob, [button.id])).rejects.toBeInstanceOf(ValidationError);
    expect((await f.bio.getEditor(users.alice)).buttons).toHaveLength(1);
  });

  it("removes a button and its link", async () => {
    const f = setup();
    await withPage(f);
    const button = await f.bio.addButton(users.alice, { label: "Shop", url: "https://shop.example" });
    await f.bio.removeButton(users.alice, button.id);
    expect((await f.bio.getEditor(users.alice)).buttons).toHaveLength(0);
    expect(await f.linkRepo.findById(button.link.id)).toBeNull();
    expect(
      await f.redirect.resolve({
        code: button.link.code,
        userAgent: BROWSER,
        searchParams: new URLSearchParams(),
      }),
    ).toEqual({
      kind: "not_found",
    });
  });

  it("reorders, and rejects an order that does not match the buttons", async () => {
    const f = setup();
    await withPage(f);
    const a = await f.bio.addButton(users.alice, { label: "A", url: "https://a.example" });
    const b = await f.bio.addButton(users.alice, { label: "B", url: "https://b.example" });
    const c = await f.bio.addButton(users.alice, { label: "C", url: "https://c.example" });

    await f.bio.reorderButtons(users.alice, [c.id, a.id, b.id]);
    expect((await f.bio.getEditor(users.alice)).buttons.map((x) => x.label)).toEqual(["C", "A", "B"]);

    for (const bad of [
      [a.id, b.id],
      [a.id, a.id, b.id],
      [a.id, b.id, c.id, "x"],
      [a.id, b.id, "x"],
    ]) {
      await expect(f.bio.reorderButtons(users.alice, bad)).rejects.toBeInstanceOf(ValidationError);
    }
    expect((await f.bio.getEditor(users.alice)).buttons.map((x) => x.label)).toEqual(["C", "A", "B"]);
  });

  it("routes clicks through the normal redirect, so they are counted", async () => {
    const f = setup();
    await withPage(f);
    const button = await f.bio.addButton(users.alice, { label: "Shop", url: "https://shop.example/x" });
    const decision = await f.redirect.resolve({
      code: button.link.code,
      userAgent: BROWSER,
      searchParams: new URLSearchParams(),
    });
    expect(decision).toMatchObject({ kind: "redirect", destination: "https://shop.example/x" });
    expect((await f.bio.getEditor(users.alice)).buttons[0]?.link.clickCount).toBe(1);
  });
});

describe("BioService.getPublic", () => {
  it("shows a published page with its visible, working buttons", async () => {
    const f = setup();
    await f.bio.saveProfile(users.alice, profile({ socials: [{ platform: "github", value: "alice" }] }));
    const shop = await f.bio.addButton(users.alice, { label: "Shop", url: "https://shop.example" });
    await f.bio.addButton(users.alice, { label: "Secret", url: "https://secret.example" });
    const hidden = await f.bio.addButton(users.alice, { label: "Hidden", url: "https://hidden.example" });
    await f.bio.updateButton(users.alice, hidden.id, { isVisible: false });

    const page = await f.bio.getPublic("Alice");
    expect(page).toMatchObject({
      handle: "alice",
      displayName: "Alice",
      theme: "paper",
      showBadge: true,
      socials: [{ platform: "github", url: "https://github.com/alice" }],
    });
    expect(page?.buttons.map((b) => b.label)).toEqual(["Shop", "Secret"]);
    expect(page?.buttons[0]?.href).toBe(`/${shop.link.code}`);
  });

  it("never exposes destinations, ids of links or the owner", async () => {
    const f = setup();
    await withPage(f);
    await f.bio.addButton(users.alice, { label: "Shop", url: "https://shop.example/private-path" });
    const text = JSON.stringify(await f.bio.getPublic("alice"));
    expect(text).not.toContain("private-path");
    expect(text).not.toContain("userId");
    expect(text).not.toContain("linkId");
  });

  it("returns nothing for unknown, invalid, unpublished or banned pages", async () => {
    const f = setup();
    expect(await f.bio.getPublic("nobody")).toBeNull();
    expect(await f.bio.getPublic("a")).toBeNull();
    expect(await f.bio.getPublic("../etc")).toBeNull();

    await f.bio.saveProfile(users.alice, profile({ isPublished: false }));
    expect(await f.bio.getPublic("alice")).toBeNull();

    await f.bio.saveProfile(users.alice, profile({ isPublished: true }));
    expect(await f.bio.getPublic("alice")).not.toBeNull();
    const row = f.userRepo.rows.find((u) => u.id === "alice");
    if (row) row.banned = true;
    expect(await f.bio.getPublic("alice")).toBeNull();
  });

  it("leaves out buttons whose link is disabled, expired, out of visits or deleted", async () => {
    const f = setup();
    await withPage(f);
    const ok = await f.bio.addButton(users.alice, { label: "OK", url: "https://ok.example" });
    const disabled = await f.bio.addButton(users.alice, { label: "Disabled", url: "https://d.example" });
    const expiring = await f.bio.addButton(users.alice, { label: "Expiring", url: "https://e.example" });
    const limited = await f.bio.addButton(users.alice, { label: "Limited", url: "https://l.example" });
    const removed = await f.bio.addButton(users.alice, { label: "Removed", url: "https://r.example" });

    await f.links.update(users.alice, disabled.link.id, { isEnabled: false });
    await f.links.update(users.alice, expiring.link.id, { expiration: { preset: "1h" } });
    await f.links.update(users.alice, limited.link.id, { maxClicks: 1 });
    await f.redirect.resolve({
      code: limited.link.code,
      userAgent: BROWSER,
      searchParams: new URLSearchParams(),
    });
    await f.links.delete(users.alice, [removed.link.id]);
    f.clock.advance(2 * 3_600_000);

    expect((await f.bio.getPublic("alice"))?.buttons.map((b) => b.label)).toEqual(["OK"]);
    expect(ok.label).toBe("OK");
  });

  it("keeps password-protected buttons: the visitor meets the password page", async () => {
    const f = setup();
    await withPage(f);
    const button = await f.bio.addButton(users.alice, { label: "Members", url: "https://m.example" });
    await f.links.update(users.alice, button.link.id, { password: "open-sesame" });
    expect((await f.bio.getPublic("alice"))?.buttons).toHaveLength(1);
  });
});

describe("BioService.deletePage", () => {
  it("removes the page, its buttons and their links, and frees the handle", async () => {
    const f = setup();
    await withPage(f);
    const button = await f.bio.addButton(users.alice, { label: "Shop", url: "https://shop.example" });
    await f.bio.deletePage(users.alice);

    expect(await f.bio.getPublic("alice")).toBeNull();
    expect((await f.bio.getEditor(users.alice)).profile).toBeNull();
    expect(await f.linkRepo.findById(button.link.id)).toBeNull();
    await expect(f.bio.saveProfile(users.bob, profile({ handle: "alice" }))).resolves.toBeDefined();
  });

  it("is a no-op when there is no page", async () => {
    const f = setup();
    await expect(f.bio.deletePage(users.alice)).resolves.toBeUndefined();
  });
});
