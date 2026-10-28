import { describe, expect, it } from "vitest";
import { GoneError, NotFoundError, RateLimitedError, ValidationError } from "@/server/errors";
import { buildFixture } from "../support/fixtures";

const BROWSER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const SLACK = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";
const req = (code: string, userAgent: string | null = BROWSER, qs = "") => ({
  code,
  userAgent,
  searchParams: new URLSearchParams(qs),
});

describe("RedirectService.resolve", () => {
  it("returns not_found for unknown or deleted codes", async () => {
    const f = buildFixture();
    expect(await f.redirect.resolve(req("nope"))).toEqual({ kind: "not_found" });
    const link = await f.linkRepo.create({ code: "del", destinationUrl: "https://x.example" });
    await f.linkRepo.softDelete([link.id], new Date());
    expect(await f.redirect.resolve(req("del"))).toEqual({ kind: "not_found" });
  });

  it("returns gone for disabled and expired links", async () => {
    const f = buildFixture();
    await f.linkRepo.create({ code: "off", destinationUrl: "https://x.example", isEnabled: false });
    await f.linkRepo.create({
      code: "old",
      destinationUrl: "https://x.example",
      expiresAt: new Date("2026-06-01T11:59:59Z"),
    });
    expect(await f.redirect.resolve(req("off"))).toEqual({ kind: "gone", reason: "disabled" });
    expect(await f.redirect.resolve(req("old"))).toEqual({ kind: "gone", reason: "expired" });
  });

  it("redirects, consumes one access and forwards the query string", async () => {
    const f = buildFixture();
    const link = await f.linkRepo.create({ code: "ok", destinationUrl: "https://d.example/p?a=1" });
    expect(await f.redirect.resolve(req("ok", BROWSER, "utm_source=x"))).toEqual({
      kind: "redirect",
      linkId: link.id,
      destination: "https://d.example/p?a=1&utm_source=x",
      routedBy: null,
      clickRef: null,
    });
    expect(f.linkRepo.rows.get(link.id)?.clickCount).toBe(1);
  });

  it("does not forward the query when disabled", async () => {
    const f = buildFixture({ forwardQueryParams: false });
    await f.linkRepo.create({ code: "ok", destinationUrl: "https://d.example/" });
    const decision = await f.redirect.resolve(req("ok", BROWSER, "a=1"));
    expect(decision).toMatchObject({ destination: "https://d.example/" });
  });

  it("returns gone(limit) once the access limit is used up", async () => {
    const f = buildFixture();
    await f.linkRepo.create({ code: "one", destinationUrl: "https://d.example/", maxClicks: 1 });
    expect((await f.redirect.resolve(req("one"))).kind).toBe("redirect");
    expect(await f.redirect.resolve(req("one"))).toEqual({ kind: "gone", reason: "limit" });
  });

  it("sends password-protected links to the password page without consuming", async () => {
    const f = buildFixture();
    const link = await f.linkRepo.create({
      code: "pw",
      destinationUrl: "https://secret.example",
      passwordHash: "plain:x",
    });
    expect(await f.redirect.resolve(req("pw"))).toEqual({ kind: "password" });
    expect(f.linkRepo.rows.get(link.id)?.clickCount).toBe(0);
  });

  it("serves preview bots escaped OG HTML without consuming access", async () => {
    const f = buildFixture();
    const link = await f.linkRepo.create({
      code: "og",
      destinationUrl: "https://d.example/",
      maxClicks: 1,
      ogTitle: "<b>Title</b>",
      ogDescription: "Desc",
    });
    const decision = await f.redirect.resolve(req("og", SLACK));
    expect(decision.kind).toBe("preview");
    if (decision.kind !== "preview") return;
    expect(decision.html).toContain("&lt;b&gt;Title&lt;/b&gt;");
    expect(decision.html).toContain("https://sho.rt/og");
    expect(decision.html).not.toMatch(/<script|http-equiv/i);
    expect(f.linkRepo.rows.get(link.id)?.clickCount).toBe(0);
  });

  it("NEVER exposes the destination of a protected link to bots", async () => {
    const f = buildFixture();
    await f.linkRepo.create({
      code: "pwbot",
      destinationUrl: "https://top-secret.example/path",
      passwordHash: "plain:x",
    });
    for (const ua of [
      SLACK,
      "facebookexternalhit/1.1",
      "Twitterbot/1.0",
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
    ]) {
      const decision = await f.redirect.resolve(req("pwbot", ua));
      expect(decision.kind).toBe("preview");
      if (decision.kind === "preview") {
        expect(decision.html).not.toContain("top-secret");
        expect(decision.html).toContain("Password-protected link");
      }
    }
  });

  it("uses the destination host as fallback title for unprotected bot previews", async () => {
    const f = buildFixture();
    await f.linkRepo.create({ code: "host", destinationUrl: "https://news.example/a" });
    const decision = await f.redirect.resolve(req("host", SLACK));
    expect(decision.kind === "preview" && decision.html.includes("<title>news.example</title>")).toBe(true);
  });
});

describe("RedirectService.unlock", () => {
  it("verifies the password, consumes access and forwards the query", async () => {
    const f = buildFixture();
    const link = await f.linkRepo.create({
      code: "pw",
      destinationUrl: "https://s.example/",
      passwordHash: "plain:open",
    });
    const result = await f.redirect.unlock({
      code: "pw",
      password: "open",
      ip: "1.1.1.1",
      searchParams: new URLSearchParams("x=1"),
    });
    expect(result).toEqual({
      linkId: link.id,
      destination: "https://s.example/?x=1",
      routedBy: null,
      clickRef: null,
    });
    expect(f.linkRepo.rows.get(link.id)?.clickCount).toBe(1);
  });

  it("rejects wrong passwords generically", async () => {
    const f = buildFixture();
    await f.linkRepo.create({ code: "pw", destinationUrl: "https://s.example/", passwordHash: "plain:open" });
    await expect(f.redirect.unlock({ code: "pw", password: "nope", ip: null })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(f.redirect.unlock({ code: "missing", password: "x", ip: null })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rehashes legacy bcrypt-style hashes transparently", async () => {
    const f = buildFixture();
    const link = await f.linkRepo.create({
      code: "leg",
      destinationUrl: "https://s.example/",
      passwordHash: "legacy:pw",
    });
    await f.redirect.unlock({ code: "leg", password: "pw", ip: null });
    expect(f.linkRepo.rows.get(link.id)?.passwordHash).toBe("plain:pw");
  });

  it("honours disabled, expired and limit states", async () => {
    const f = buildFixture();
    await f.linkRepo.create({
      code: "a",
      destinationUrl: "https://s.example/",
      passwordHash: "plain:p",
      isEnabled: false,
    });
    await f.linkRepo.create({
      code: "b",
      destinationUrl: "https://s.example/",
      passwordHash: "plain:p",
      expiresAt: new Date("2020-01-01"),
    });
    await f.linkRepo.create({
      code: "c",
      destinationUrl: "https://s.example/",
      passwordHash: "plain:p",
      maxClicks: 1,
      clickCount: 1,
    });
    for (const code of ["a", "b", "c"]) {
      await expect(f.redirect.unlock({ code, password: "p", ip: null })).rejects.toBeInstanceOf(GoneError);
    }
  });

  it("rate limits attempts per (IP, code)", async () => {
    const f = buildFixture();
    await f.linkRepo.create({ code: "pw", destinationUrl: "https://s.example/", passwordHash: "plain:open" });
    for (let i = 0; i < 10; i++) {
      await expect(f.redirect.unlock({ code: "pw", password: "bad", ip: "9.9.9.9" })).rejects.toBeInstanceOf(
        ValidationError,
      );
    }
    await expect(f.redirect.unlock({ code: "pw", password: "open", ip: "9.9.9.9" })).rejects.toBeInstanceOf(
      RateLimitedError,
    );
    // another IP is still allowed
    await expect(f.redirect.unlock({ code: "pw", password: "open", ip: "8.8.8.8" })).resolves.toBeDefined();
  });
});
