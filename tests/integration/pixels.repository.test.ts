import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleLinkRepository } from "@/server/repositories/drizzle/link.repository.drizzle";
import { connect, createUser, truncateAll } from "./helpers";

const { db, close } = connect();
const links = new DrizzleLinkRepository(db);

afterAll(close);
beforeEach(() => truncateAll(db));

describe("links.pixels", () => {
  it("round-trips the IDs and leaves plain links without any", async () => {
    const user = await createUser(db);
    const link = await links.create({
      code: "pix",
      destinationUrl: "https://news.example/story",
      userId: user.id,
      pixels: { meta: "123456789012345", google: "G-ABCD1234" },
    });
    expect(link.pixels).toEqual({ meta: "123456789012345", google: "G-ABCD1234" });
    expect((await links.findByCode("pix"))?.pixels).toEqual({
      meta: "123456789012345",
      google: "G-ABCD1234",
    });

    const plain = await links.create({ code: "plain", destinationUrl: "https://a.example/" });
    expect(plain.pixels).toBeNull();
  });

  it("replaces and removes pixels on update", async () => {
    const link = await links.create({
      code: "edit",
      destinationUrl: "https://a.example/",
      pixels: { meta: "123456789" },
    });
    const replaced = await links.update(link.id, { pixels: { google: "GTM-ABC123" } });
    expect(replaced?.pixels).toEqual({ google: "GTM-ABC123" });
    const removed = await links.update(link.id, { pixels: null });
    expect(removed?.pixels).toBeNull();
  });
});
