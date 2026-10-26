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

  describe("properties", () => {
    // Deterministic pseudo-random strings (mulberry32) so a failure is reproducible.
    function* samples(count: number): Generator<string> {
      const alphabet = ["a", "Z", "7", " ", "  ", "#", "-", "_", ";", "é", "İ", "日", "\t", " ", "😀"];
      let seed = 0x9e3779b9;
      const next = () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      for (let i = 0; i < count; i++) {
        const length = Math.floor(next() * 12);
        let text = "";
        for (let j = 0; j < length; j++) text += alphabet[Math.floor(next() * alphabet.length)];
        yield text;
      }
    }

    it("normalizeTag is idempotent", () => {
      for (const text of ["# #a", "##  #b c", " \t#x", "#", "  ", ...samples(500)]) {
        const once = normalizeTag(text);
        expect(normalizeTag(once), JSON.stringify(text)).toBe(once);
      }
    });

    it("normalizeTags is idempotent, duplicate-free and never returns empty entries", () => {
      const list = [...samples(40)];
      const once = normalizeTags(list);
      expect(normalizeTags(once)).toEqual(once);
      expect(new Set(once).size).toBe(once.length);
      expect(once).not.toContain("");
    });

    it("a normalized tag never contains whitespace or uppercase letters", () => {
      for (const text of samples(500)) {
        const tag = normalizeTag(text);
        expect(tag, JSON.stringify(text)).not.toMatch(/\s/);
        expect(tag).toBe(tag.toLowerCase());
      }
    });

    it("strips repeated leading hashes and spaces", () => {
      expect(normalizeTag("# #a")).toBe("a");
      expect(normalizeTag("  ##  Big Sale ")).toBe("big-sale");
    });

    it("handles unicode: letters and digits from any script are valid", () => {
      expect(normalizeTag("Été")).toBe("été");
      expect(isValidTag("été")).toBe(true);
      expect(isValidTag("日本語")).toBe(true);
      expect(isValidTag("😀")).toBe(false);
      expect(isValidTag("a😀")).toBe(false);
    });

    it("counts the length limit in UTF-16 code units of the normalized tag", () => {
      expect(isValidTag("é".repeat(30))).toBe(true);
      expect(isValidTag("é".repeat(31))).toBe(false);
    });

    it("keeps first-seen order when de-duplicating", () => {
      expect(normalizeTags(["b", "A", "a", "B", "c"])).toEqual(["b", "a", "c"]);
    });
  });
});

describe("tag schemas", () => {
  const base = {
    destinationUrl: "https://example.com",
    accessLimit: "unlimited",
    expiration: "never",
  } as const;
  const colours = {
    qrFgColor: "#000000",
    qrBgColor: "#FFFFFF",
    qrEcc: "H",
    qrFrame: "none",
    qrFrameText: "",
  } as const;

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
