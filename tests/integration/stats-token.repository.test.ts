import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { connect, truncateAll } from "./helpers";

const { db, close } = connect();
const links = new DrizzleLinkRepository(db);

afterAll(close);
beforeEach(() => truncateAll(db));

describe("links.stats_token", () => {
  it("is empty by default and finds a link by its token", async () => {
    const plain = await links.create({ code: "plain", destinationUrl: "https://a.example/" });
    expect(plain.statsToken).toBeNull();
    expect(await links.findByStatsToken("anything-at-all-123456")).toBeNull();

    const shared = await links.create({
      code: "shared",
      destinationUrl: "https://b.example/",
      statsToken: "tok_abcdefghijklmnopq",
    });
    expect((await links.findByStatsToken("tok_abcdefghijklmnopq"))?.id).toBe(shared.id);
    expect(await links.findByStatsToken("tok_abcdefghijklmnopQ")).toBeNull(); // case-sensitive
  });

  it("revokes by clearing the token, and forgets deleted links", async () => {
    const link = await links.create({
      code: "rev",
      destinationUrl: "https://a.example/",
      statsToken: "tok_revoked_aaaaaaaaa",
    });
    await links.update(link.id, { statsToken: null });
    expect(await links.findByStatsToken("tok_revoked_aaaaaaaaa")).toBeNull();

    const other = await links.create({
      code: "del",
      destinationUrl: "https://a.example/",
      statsToken: "tok_deleted_aaaaaaaaa",
    });
    await links.softDelete([other.id], new Date());
    expect(await links.findByStatsToken("tok_deleted_aaaaaaaaa")).toBeNull();
  });

  it("allows many links without a token but never two with the same one", async () => {
    await links.create({ code: "n1", destinationUrl: "https://a.example/" });
    await links.create({ code: "n2", destinationUrl: "https://a.example/" });
    await links.create({
      code: "t1",
      destinationUrl: "https://a.example/",
      statsToken: "tok_same_aaaaaaaaaaaaa",
    });
    const duplicate = links.create({
      code: "t2",
      destinationUrl: "https://a.example/",
      statsToken: "tok_same_aaaaaaaaaaaaa",
    });
    await expect(duplicate).rejects.toBeInstanceOf(Error);
    // The same value after a revoke is fine.
    const first = await links.findByStatsToken("tok_same_aaaaaaaaaaaaa");
    if (!first) throw new Error("expected the first link to exist");
    await links.update(first.id, { statsToken: null });
    await expect(
      links.create({
        code: "t3",
        destinationUrl: "https://a.example/",
        statsToken: "tok_same_aaaaaaaaaaaaa",
      }),
    ).resolves.toMatchObject({ code: "t3" });
  });
});
