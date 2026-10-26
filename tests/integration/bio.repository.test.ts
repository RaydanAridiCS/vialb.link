import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { bioButtons, bioProfiles } from "@/server/db/schema";
import type { NewBioProfile } from "@/server/domain/types";
import { UniqueViolationError } from "@/server/errors";
import { DrizzleBioRepository } from "@/server/repositories/drizzle/bio.repository.drizzle";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { connect, createUser, truncateAll } from "./helpers";

const { db, close } = connect();
const bio = new DrizzleBioRepository(db);
const links = new DrizzleLinkRepository(db);

afterAll(close);
beforeEach(() => truncateAll(db));

function newProfile(userId: string, overrides: Partial<NewBioProfile> = {}): NewBioProfile {
  return {
    userId,
    handle: `h_${userId.slice(-6).toLowerCase()}`,
    displayName: "Alice",
    bio: null,
    avatarUrl: null,
    theme: "paper",
    socials: [],
    showBadge: true,
    isPublished: false,
    ...overrides,
  };
}

async function buttonLink(userId: string, code: string) {
  return links.create({ code, destinationUrl: `https://${code}.example`, userId, kind: "bio_button" });
}

describe("DrizzleBioRepository profiles", () => {
  it("creates, finds by user and by handle, and keeps socials as JSON", async () => {
    const user = await createUser(db);
    const saved = await bio.saveProfile(
      newProfile(user.id, {
        handle: "alice",
        socials: [{ platform: "github", url: "https://github.com/alice" }],
      }),
    );
    expect(saved).toMatchObject({ handle: "alice", theme: "paper", showBadge: true, isPublished: false });
    expect(saved.socials).toEqual([{ platform: "github", url: "https://github.com/alice" }]);
    expect(await bio.findProfileByUserId(user.id)).toMatchObject({ handle: "alice" });
    expect(await bio.findProfileByHandle("alice")).toMatchObject({ userId: user.id });
    expect(await bio.findProfileByHandle("Alice")).toBeNull();
    expect(await bio.findProfileByHandle("nobody")).toBeNull();
  });

  it("updates the same row when a user saves again and moves updatedAt forward", async () => {
    const user = await createUser(db);
    const first = await bio.saveProfile(newProfile(user.id, { handle: "alice" }));
    const second = await bio.saveProfile(newProfile(user.id, { handle: "alice2", isPublished: true }));
    expect(second).toMatchObject({ handle: "alice2", isPublished: true });
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
    expect(await db.select().from(bioProfiles)).toHaveLength(1);
    expect(await bio.findProfileByHandle("alice")).toBeNull();
  });

  it("refuses a handle another user holds", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    await bio.saveProfile(newProfile(a.id, { handle: "taken" }));
    await expect(bio.saveProfile(newProfile(b.id, { handle: "taken" }))).rejects.toBeInstanceOf(
      UniqueViolationError,
    );
    expect(await bio.findProfileByUserId(b.id)).toBeNull();
  });

  it("deletes a profile together with its buttons and returns them", async () => {
    const user = await createUser(db);
    await bio.saveProfile(newProfile(user.id));
    const link = await buttonLink(user.id, "shop");
    await bio.addButton({ userId: user.id, linkId: link.id, label: "Shop" });

    const removed = await bio.deleteProfile(user.id);
    expect(removed.map((b) => b.label)).toEqual(["Shop"]);
    expect(await bio.findProfileByUserId(user.id)).toBeNull();
    expect(await bio.listButtons(user.id)).toEqual([]);
    expect(await bio.deleteProfile(user.id)).toEqual([]);
  });

  it("is removed with the user", async () => {
    const user = await createUser(db);
    await bio.saveProfile(newProfile(user.id));
    const link = await buttonLink(user.id, "shop");
    await bio.addButton({ userId: user.id, linkId: link.id, label: "Shop" });
    await db.execute(sql`delete from "user" where id = ${user.id}`);
    expect(await db.select().from(bioProfiles)).toEqual([]);
    expect(await db.select().from(bioButtons)).toEqual([]);
  });
});

describe("DrizzleBioRepository buttons", () => {
  it("appends buttons after the last position, per user", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    const first = await bio.addButton({
      userId: a.id,
      linkId: (await buttonLink(a.id, "a1")).id,
      label: "One",
    });
    const second = await bio.addButton({
      userId: a.id,
      linkId: (await buttonLink(a.id, "a2")).id,
      label: "Two",
    });
    const other = await bio.addButton({
      userId: b.id,
      linkId: (await buttonLink(b.id, "b1")).id,
      label: "Mine",
    });
    expect([first.position, second.position, other.position]).toEqual([0, 1, 0]);
    expect((await bio.listButtons(a.id)).map((x) => x.label)).toEqual(["One", "Two"]);
  });

  it("gives parallel adds distinct, gap-free-enough positions without losing buttons", async () => {
    const user = await createUser(db);
    const created = await Promise.all(
      Array.from({ length: 8 }, async (_, i) =>
        bio.addButton({ userId: user.id, linkId: (await buttonLink(user.id, `p${i}`)).id, label: `B${i}` }),
      ),
    );
    expect(created).toHaveLength(8);
    expect(await bio.listButtons(user.id)).toHaveLength(8);
  });

  it("updates label and visibility and finds buttons by id", async () => {
    const user = await createUser(db);
    const button = await bio.addButton({
      userId: user.id,
      linkId: (await buttonLink(user.id, "x")).id,
      label: "Old",
    });
    expect(await bio.updateButton(button.id, { label: "New", isVisible: false })).toMatchObject({
      label: "New",
      isVisible: false,
    });
    expect(await bio.updateButton(button.id, {})).toMatchObject({ label: "New" });
    expect(await bio.findButton(button.id)).toMatchObject({ label: "New", isVisible: false });
    expect(await bio.updateButton("00000000-0000-0000-0000-000000000000", { label: "x" })).toBeNull();
    await bio.deleteButton(button.id);
    expect(await bio.findButton(button.id)).toBeNull();
  });

  it("reorders only the user's own buttons", async () => {
    const a = await createUser(db);
    const b = await createUser(db);
    const one = await bio.addButton({
      userId: a.id,
      linkId: (await buttonLink(a.id, "o1")).id,
      label: "One",
    });
    const two = await bio.addButton({
      userId: a.id,
      linkId: (await buttonLink(a.id, "o2")).id,
      label: "Two",
    });
    const mine = await bio.addButton({
      userId: b.id,
      linkId: (await buttonLink(b.id, "o3")).id,
      label: "Mine",
    });

    await bio.reorderButtons(a.id, [two.id, one.id, mine.id]);
    expect((await bio.listButtons(a.id)).map((x) => x.label)).toEqual(["Two", "One"]);
    expect((await bio.findButton(mine.id))?.position).toBe(0);
  });

  it("allows one button per link", async () => {
    const user = await createUser(db);
    const link = await buttonLink(user.id, "once");
    await bio.addButton({ userId: user.id, linkId: link.id, label: "A" });
    await expect(bio.addButton({ userId: user.id, linkId: link.id, label: "B" })).rejects.toThrow();
    expect(await db.select().from(bioButtons).where(eq(bioButtons.linkId, link.id))).toHaveLength(1);
  });
});

describe("DrizzleLinkRepository with bio buttons", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("hides bio buttons from lists, the cursor and the overview unless asked for", async () => {
    const user = await createUser(db);
    await links.create({ code: "normal", destinationUrl: "https://n.example", userId: user.id });
    await buttonLink(user.id, "hidden");
    const base = { userId: user.id, page: 1, pageSize: 20, now };

    expect((await links.list(base)).items.map((l) => l.code)).toEqual(["normal"]);
    expect((await links.list({ ...base, kind: "link" })).total).toBe(1);
    expect((await links.list({ ...base, kind: "bio_button" })).items.map((l) => l.code)).toEqual(["hidden"]);
    expect((await links.list({ ...base, kind: "any" })).total).toBe(2);
    expect((await links.list({ page: 1, pageSize: 20, now })).total).toBe(1);

    expect((await links.listByCursor(user.id, null, 10)).items.map((l) => l.code)).toEqual(["normal"]);
    expect((await links.overview(user.id, now)).totalLinks).toBe(1);
    expect(await links.listAllByUser(user.id)).toHaveLength(2);
    expect(await links.count()).toBe(2);
  });

  it("finds several links by id, skipping deleted ones", async () => {
    const user = await createUser(db);
    const a = await links.create({ code: "fa", destinationUrl: "https://a.example", userId: user.id });
    const b = await links.create({ code: "fb", destinationUrl: "https://b.example", userId: user.id });
    const c = await links.create({ code: "fc", destinationUrl: "https://c.example", userId: user.id });
    await links.softDelete([c.id], now);

    const found = await links.findManyByIds([a.id, b.id, c.id]);
    expect(found.map((l) => l.code).sort()).toEqual(["fa", "fb"]);
    expect(await links.findManyByIds([])).toEqual([]);
  });

  it("defaults new links to kind link", async () => {
    const link = await links.create({ code: "plain", destinationUrl: "https://p.example" });
    expect(link.kind).toBe("link");
  });
});
