import { describe, expect, it } from "vitest";
import {
  apiCreateLinkSchema,
  apiUpdateLinkSchema,
  toCreateCommand,
  toUpdateCommand,
} from "@/features/links/api-schemas";
import { createLinkSchema, linkListParamsSchema } from "@/features/links/schemas";
import { isValidTag, normalizeTag, normalizeTags } from "@/lib/tags";
import { ValidationError } from "@/server/errors";
import { buildFixture, users } from "../support/fixtures";

describe("tag helpers", () => {
  it("normalizes case, hashes and whitespace", () => {
    expect(normalizeTag("  #Client Work ")).toBe("client-work");
    expect(normalizeTag("###")).toBe("");
    expect(normalizeTags(["Promo", "#promo", " ", "menus", "PROMO"])).toEqual(["promo", "menus"]);
  });

  it("validates characters and length", () => {
    expect(isValidTag("spring_2026")).toBe(true);
    expect(isValidTag("café")).toBe(true);
    expect(isValidTag("a".repeat(30))).toBe(true);
    expect(isValidTag("a".repeat(31))).toBe(false);
    expect(isValidTag("-lead")).toBe(false);
    expect(isValidTag("no spaces")).toBe(false);
    expect(isValidTag("semi;colon")).toBe(false);
    expect(isValidTag("")).toBe(false);
  });
});

describe("tag schemas", () => {
  const base = {
    destinationUrl: "https://example.com",
    accessLimit: "unlimited",
    expiration: "never",
  } as const;
  const colours = { qrFgColor: "#000000", qrBgColor: "#FFFFFF" };

  it("accepts what people type in the form and rejects junk or too many", () => {
    expect(createLinkSchema.safeParse({ ...base, ...colours, tags: ["#Promo", "client work"] }).success).toBe(
      true,
    );
    expect(createLinkSchema.safeParse({ ...base, ...colours, tags: ["bad;tag"] }).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(createLinkSchema.safeParse({ ...base, ...colours, tags: eleven }).success).toBe(false);
  });

  it("parses the tag filter and ignores garbage", () => {
    expect(linkListParamsSchema.parse({ tag: " promo " }).tag).toBe("promo");
    expect(linkListParamsSchema.parse({ tag: "x".repeat(99) }).tag).toBeUndefined();
  });

  it("maps API tags: omitted keeps, array replaces", () => {
    const create = apiCreateLinkSchema.parse({ url: "https://example.com", tags: ["Promo"] });
    expect(toCreateCommand(create).tags).toEqual(["Promo"]);
    expect(toUpdateCommand(apiUpdateLinkSchema.parse({})).tags).toBeUndefined();
    expect(toUpdateCommand(apiUpdateLinkSchema.parse({ tags: [] })).tags).toEqual([]);
    expect(apiCreateLinkSchema.safeParse({ url: "https://example.com", tags: ["a b;c"] }).success).toBe(
      false,
    );
  });
});

describe("LinkService tags", () => {
  it("stores normalized, de-duplicated tags and returns them in the DTO", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://example.com", tags: ["#Promo", "promo", "Client Work"] },
      { ip: null },
    );
    expect(link.tags).toEqual(["promo", "client-work"]);
    const plain = await f.links.create(users.alice, { destinationUrl: "https://example.org" }, { ip: null });
    expect(plain.link.tags).toEqual([]);
  });

  it("rejects too many or malformed tags", async () => {
    const f = buildFixture();
    const tooMany = Array.from({ length: 11 }, (_, i) => `t${i}`);
    await expect(
      f.links.create(users.alice, { destinationUrl: "https://example.com", tags: tooMany }, { ip: null }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      f.links.create(users.alice, { destinationUrl: "https://example.com", tags: ["bad;tag"] }, { ip: null }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("update replaces tags, an empty array clears them and undefined keeps them", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://example.com", tags: ["a", "b"] },
      { ip: null },
    );
    expect((await f.links.update(users.alice, link.id, { title: "x" })).tags).toEqual(["a", "b"]);
    expect((await f.links.update(users.alice, link.id, { tags: ["C"] })).tags).toEqual(["c"]);
    expect((await f.links.update(users.alice, link.id, { tags: [] })).tags).toEqual([]);
  });

  it("filters by tag (case-insensitive input) and lists the tags in use per owner", async () => {
    const f = buildFixture();
    const make = (user: typeof users.alice, tags: string[]) =>
      f.links.create(user, { destinationUrl: "https://example.com", tags }, { ip: null });
    await make(users.alice, ["promo", "menus"]);
    await make(users.alice, ["promo"]);
    await make(users.alice, []);
    await make(users.bob, ["bob-only"]);

    expect((await f.links.list(users.alice, { tag: "Promo" })).total).toBe(2);
    expect((await f.links.list(users.alice, { tag: "menus" })).total).toBe(1);
    expect((await f.links.list(users.alice, { tag: "bob-only" })).total).toBe(0);
    expect((await f.links.list(users.alice, {})).total).toBe(3);

    expect(await f.links.listTags(users.alice)).toEqual(["menus", "promo"]);
    expect(await f.links.listTags(users.alice, "all")).toEqual(["menus", "promo"]);
    expect(await f.links.listTags(users.admin, "all")).toEqual(["bob-only", "menus", "promo"]);
  });
});
