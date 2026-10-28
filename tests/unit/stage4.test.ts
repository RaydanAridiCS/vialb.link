import { describe, expect, it } from "vitest";
import { cleanBranding, contrastWithWhite } from "@/lib/branding";
import {
  goneHtml,
  interstitialHtml,
  isGoneReason,
  notFoundHtml,
  staticPageCsp,
} from "@/server/http/static-pages";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { buildFixture, defined, users } from "../support/fixtures";

describe("cleanBranding", () => {
  it("trims, drops empty fields and normalizes the colour", () => {
    const { value, problems } = cleanBranding({
      brandName: "  Acme  ",
      accentColor: " #1a7f5a ",
      logoUrl: "",
      notFoundMessage: "  ",
      homeUrl: "/pricing",
      homeLabel: "Pricing",
    });
    expect(problems).toEqual([]);
    expect(value).toEqual({
      brandName: "Acme",
      accentColor: "#1A7F5A",
      homeUrl: "/pricing",
      homeLabel: "Pricing",
    });
    expect(cleanBranding(null)).toEqual({ value: {}, problems: [] });
  });

  it.each([
    [{ accentColor: "green" }, /accent colour must look like/],
    [{ accentColor: "#FFEE00" }, /too light/],
    [{ logoUrl: "http://a.example/logo.png" }, /https/],
    [{ logoUrl: "javascript:alert(1)" }, /https/],
    [{ logoUrl: "https://user:pw@a.example/l.png" }, /https/],
    [{ homeUrl: "javascript:alert(1)" }, /button link/],
    [{ homeUrl: "//evil.example" }, /button link/],
    [{ homeUrl: "/a\\b" }, /button link/],
    [{ homeUrl: "ftp://a.example" }, /button link/],
    [{ brandName: "x".repeat(41) }, /at most 40/],
    [{ notFoundMessage: "x".repeat(201) }, /at most 200/],
    [{ homeLabel: "x".repeat(31) }, /at most 30/],
  ])("rejects %j", (input, message) => {
    expect(cleanBranding(input).problems.join(" ")).toMatch(message);
  });

  it("accepts dark and mid colours and measures contrast against white", () => {
    expect(cleanBranding({ accentColor: "#0F7A55" }).problems).toEqual([]);
    expect(contrastWithWhite("#000000")).toBeGreaterThan(20);
    expect(contrastWithWhite("#FFFFFF")).toBeCloseTo(1, 1);
  });

  it("turns control characters into spaces", () => {
    expect(cleanBranding({ brandName: "A\u0000\nB" }).value.brandName).toBe("A  B");
  });
});

describe("static pages", () => {
  it("serves the 404 page with the default look, escaping the code", () => {
    const html = notFoundHtml('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("This short link doesn&#39;t exist");
    expect(html).toContain("#0F7A55".toLowerCase());
    expect(html).not.toMatch(/<script/i);
  });

  it("applies branding everywhere and escapes it", () => {
    const html = notFoundHtml("abc", {
      brandName: 'Acme "Co" <b>',
      accentColor: "#1A7F5A",
      logoUrl: "https://cdn.example/logo.png?a=1&b=2",
      notFoundMessage: "Try <script>alert(1)</script>",
      homeLabel: "Visit us",
      homeUrl: "https://acme.example/",
    });
    expect(html).toContain("Acme &quot;Co&quot; &lt;b&gt;");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<script>");
    expect(html).toContain('src="https://cdn.example/logo.png?a=1&amp;b=2"');
    expect(html).toContain("--accent:#1A7F5A");
    expect(html).toContain('href="https://acme.example/">Visit us');
    expect(html).toContain("Try &lt;script&gt;");
  });

  it("gone pages carry the reason, the 410 number and the owner's wording", () => {
    for (const [reason, title] of [
      ["expired", "This link has expired"],
      ["limit", "This link reached its visit limit"],
      ["disabled", "This link has been disabled"],
    ] as const) {
      const html = goneHtml(reason, "abc");
      expect(html).toContain(title);
      expect(html).toContain(`data-reason="${reason}"`);
      expect(html).toContain('class="code">410<');
    }
    expect(goneHtml("expired", "abc", { goneMessage: "Back soon." })).toContain("Back soon.");
    expect(isGoneReason("expired")).toBe(true);
    expect(isGoneReason("deleted")).toBe(false);
    expect(isGoneReason(null)).toBe(false);
  });

  it("only allows images when a logo is set, and never scripts", () => {
    expect(staticPageCsp()).not.toContain("img-src");
    expect(staticPageCsp({ logoUrl: "https://a.example/l.png" })).toContain("img-src https:");
    for (const csp of [staticPageCsp(), staticPageCsp({ logoUrl: "https://a.example/l.png" })]) {
      expect(csp).toContain("default-src 'none'");
      expect(csp).not.toContain("script-src");
      expect(csp).toContain("frame-ancestors 'none'");
    }
  });

  it("the preview page shows the full destination, a plain Continue link and no automatic redirect", () => {
    const html = interstitialHtml("https://shop.example/a?x=1&y=2", "promo");
    expect(html).toContain('data-testid="interstitial-host">shop.example<');
    expect(html).toContain("https://shop.example/a?x=1&amp;y=2");
    expect(html).toContain(
      'href="https://shop.example/a?x=1&amp;y=2" rel="noopener nofollow" referrerpolicy="strict-origin-when-cross-origin"',
    );
    expect(html).not.toMatch(/http-equiv=["']refresh|<script|location\./i);
    expect(html).not.toContain("Go to Vialb"); // no home button; it has its own actions
  });

  it("the preview page never links to something that is not http(s)", () => {
    const html = interstitialHtml("javascript:alert(1)", "x");
    expect(html).toContain('data-testid="interstitial-continue" href="/"');
  });
});

describe("410 for gone links", () => {
  async function seed() {
    const f = buildFixture();
    const make = async (code: string, extra: Record<string, unknown> = {}) =>
      (
        await f.links.create(
          users.alice,
          { destinationUrl: `https://${code}.example/`, customCode: code, ...extra },
          { ip: null },
        )
      ).link;
    return { f, make };
  }
  const resolve = (
    f: Awaited<ReturnType<typeof seed>>["f"],
    code: string,
    userAgent = "Mozilla/5.0 Chrome/130",
  ) => f.redirect.resolve({ code, userAgent, searchParams: new URLSearchParams(), ip: "203.0.113.1" });

  it("HEAD answers 410 for disabled, expired and out-of-visits links, 404 for unknown and deleted ones", async () => {
    const { f, make } = await seed();
    const ok = await make("fine");
    const off = await make("turned-off");
    await f.links.setEnabled(users.alice, [off.id], false);
    await make("timed", { expiration: { preset: "1h" } });
    const limited = await make("limited", { maxClicks: 1 });
    const removed = await make("removed");
    await f.links.delete(users.alice, [removed.id]);

    expect(await f.redirect.headStatus("fine")).toBe(200);
    expect(await f.redirect.headStatus("turned-off")).toBe(410);
    expect(await f.redirect.headStatus("limited")).toBe(200);
    for (const row of f.linkRepo.rows.values()) if (row.id === limited.id) row.clickCount = 1;
    expect(await f.redirect.headStatus("limited")).toBe(410);
    f.clock.advance(2 * 3_600_000);
    expect(await f.redirect.headStatus("timed")).toBe(410);
    expect(await f.redirect.headStatus("nope")).toBe(404);
    expect(await f.redirect.headStatus("removed")).toBe(404);
    expect(ok.code).toBe("fine");
  });

  it("crawlers get the gone decision too, ahead of the link preview", async () => {
    const { f, make } = await seed();
    const link = await make("crawled");
    await f.links.setEnabled(users.alice, [link.id], false);
    expect(await resolve(f, "crawled", "facebookexternalhit/1.1")).toEqual({
      kind: "gone",
      reason: "disabled",
    });
    expect(await resolve(f, "missing")).toEqual({ kind: "not_found" });
  });
});

describe("preview page decision", () => {
  it("shows the interstitial with the final destination, consuming an access and recording the id", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://shop.example/p?x=1", customCode: "previewed", maxClicks: 2 },
      { ip: null },
    );
    await f.links.update(users.alice, link.id, { previewInterstitial: true, conversionsEnabled: true });
    const decision = await f.redirect.resolve({
      code: "previewed",
      userAgent: "Mozilla/5.0 Chrome/130",
      searchParams: new URLSearchParams("utm_source=x"),
      ip: "203.0.113.1",
    });
    expect(decision.kind).toBe("interstitial");
    if (decision.kind !== "interstitial") return;
    const url = new URL(decision.destination);
    expect(url.searchParams.get("utm_source")).toBe("x");
    expect(url.searchParams.get("vclid")).toBe(decision.clickRef);
    expect(f.linkRepo.rows.get(link.id)?.clickCount).toBe(1);
  });

  it("crawlers still get the normal link preview, not the interstitial", async () => {
    const f = buildFixture();
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://a.example/", customCode: "bots1" },
      { ip: null },
    );
    await f.links.update(users.alice, link.id, { previewInterstitial: true });
    const decision = await f.redirect.resolve({
      code: "bots1",
      userAgent: "facebookexternalhit/1.1",
      searchParams: new URLSearchParams(),
      ip: null,
    });
    expect(decision.kind).toBe("preview");
  });

  it("cannot be combined with retargeting pixels in either order", async () => {
    const f = buildFixture({ pixelsEnabled: true });
    const { link } = await f.links.create(
      users.alice,
      { destinationUrl: "https://a.example/", customCode: "pixprev", pixels: { meta: "123456789" } },
      { ip: null },
    );
    await expect(f.links.update(users.alice, link.id, { previewInterstitial: true })).rejects.toThrow(
      /pixels/,
    );
    await f.links.update(users.alice, link.id, { pixels: null });
    await f.links.update(users.alice, link.id, { previewInterstitial: true });
    await expect(f.links.update(users.alice, link.id, { pixels: { meta: "123456789" } })).rejects.toThrow(
      ValidationError,
    );
    expect(
      (
        await f.links.update(users.alice, link.id, {
          previewInterstitial: false,
          pixels: { meta: "123456789" },
        })
      ).pixels,
    ).toEqual({
      meta: "123456789",
    });
  });
});

describe("AdminGateService", () => {
  const adminNoTotp = { id: "root", role: "admin", twoFactorEnabled: false };

  it("asks administrators without two-factor to enrol, only when the setting is on", async () => {
    const off = buildFixture();
    expect(await off.adminGate.mustEnroll(adminNoTotp)).toBe(false);
    const on = buildFixture({ requireAdmin2fa: true });
    expect(await on.adminGate.mustEnroll(adminNoTotp)).toBe(true);
    expect(await on.adminGate.mustEnroll({ ...adminNoTotp, twoFactorEnabled: null })).toBe(true);
    expect(await on.adminGate.mustEnroll({ ...adminNoTotp, twoFactorEnabled: true })).toBe(false);
  });

  it("never applies to ordinary users", async () => {
    const f = buildFixture({ requireAdmin2fa: true });
    expect(await f.adminGate.mustEnroll({ id: "alice", role: "user", twoFactorEnabled: false })).toBe(false);
    expect(await f.adminGate.mustEnroll({ id: "alice", role: null })).toBe(false);
  });

  it("the emergency switch overrides the saved setting", async () => {
    const f = buildFixture({ requireAdmin2fa: true, adminEmergencyOff: true });
    expect(f.adminGate.emergencyOff).toBe(true);
    expect(await f.adminGate.isRequired()).toBe(false);
    expect(await f.adminGate.mustEnroll(adminNoTotp)).toBe(false);
  });

  it("follows the saved override over the environment default, in both directions", async () => {
    const f = buildFixture({ requireAdmin2fa: false });
    await f.settings.update(users.admin, { requireAdmin2fa: true });
    expect(await f.adminGate.mustEnroll(adminNoTotp)).toBe(true);
    await f.settings.update(users.admin, { requireAdmin2fa: false });
    expect(await f.adminGate.mustEnroll(adminNoTotp)).toBe(false);
    await f.settings.update(users.admin, { requireAdmin2fa: null });
    expect((await f.settings.get()).requireAdmin2fa).toBe(false);
  });

  it("leaves administrators who have no password alone, since they could never enrol", async () => {
    const f = buildFixture({ requireAdmin2fa: true });
    f.userRepo.socialOnly.add("root");
    expect(await f.adminGate.mustEnroll(adminNoTotp)).toBe(false);
    expect(await f.adminGate.mustEnroll({ ...adminNoTotp, id: "other-admin" })).toBe(true);
  });
});

describe("saving branding", () => {
  it("stores a cleaned value, resets to the default, and refuses bad input", async () => {
    const f = buildFixture();
    await f.settings.update(users.admin, { branding: { brandName: " Acme ", accentColor: "#0f7a55" } });
    expect((await f.settings.get()).branding).toEqual({ brandName: "Acme", accentColor: "#0F7A55" });
    await f.settings.update(users.admin, { branding: {} });
    expect((await f.settings.get()).branding).toEqual({});
    await f.settings.update(users.admin, { branding: { brandName: "x" } });
    await f.settings.update(users.admin, { branding: null });
    expect((await f.settings.get()).branding).toEqual({});

    await expect(
      f.settings.update(users.admin, { branding: { logoUrl: "http://a.example/l.png" } }),
    ).rejects.toThrow(ValidationError);
    await expect(f.settings.update(users.alice, { branding: { brandName: "Mine" } })).rejects.toThrow(
      ForbiddenError,
    );
    expect(defined((await f.settings.getDetailed()).overrides).branding).toBeNull();
  });
});
