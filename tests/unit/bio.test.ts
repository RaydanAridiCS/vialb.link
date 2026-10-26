import { describe, expect, it } from "vitest";
import { addBioButtonSchema, saveBioProfileSchema } from "@/features/bio/schemas";
import { handleProblem, normalizeHandle, normalizeSocialUrl, SOCIAL_PLATFORMS } from "@/lib/bio";
import { LIMITS } from "@/lib/constants";
import { contrastRatio } from "@/lib/qr-options";
import { isPaletteKey, PALETTE_KEYS, PALETTES } from "@/lib/palettes";

describe("bio handles", () => {
  it("normalizes case, whitespace and a leading @", () => {
    expect(normalizeHandle("  @Alice_01 ")).toBe("alice_01");
    expect(normalizeHandle("alice")).toBe("alice");
  });

  it("is idempotent", () => {
    for (const raw of ["@Bob", " bob ", "BOB", "@@bob"]) {
      expect(normalizeHandle(normalizeHandle(raw))).toBe(normalizeHandle(raw));
    }
  });

  it("accepts letters, digits and underscores within the length limits", () => {
    expect(handleProblem("alice")).toBeNull();
    expect(handleProblem("a_1")).toBeNull();
    expect(handleProblem("a".repeat(30))).toBeNull();
  });

  it.each([
    ["ab", /3-30/],
    ["a".repeat(31), /3-30/],
    ["has space", /letters, numbers/],
    ["dash-ed", /letters, numbers/],
    ["ünïcode", /letters, numbers/],
    ["admin", /reserved/],
    ["api", /reserved/],
    ["u", /3-30/],
    ["vialb", /reserved/],
    ["support", /reserved/],
  ])("rejects %s", (handle, message) => {
    expect(handleProblem(handle)).toMatch(message);
  });
});

describe("normalizeSocialUrl", () => {
  it("turns bare handles into profile URLs", () => {
    expect(normalizeSocialUrl("instagram", "alice")).toEqual({
      ok: true,
      url: "https://instagram.com/alice",
    });
    expect(normalizeSocialUrl("instagram", "@alice")).toEqual({
      ok: true,
      url: "https://instagram.com/alice",
    });
    expect(normalizeSocialUrl("tiktok", "@alice")).toEqual({
      ok: true,
      url: "https://www.tiktok.com/@alice",
    });
    expect(normalizeSocialUrl("github", "alice")).toEqual({ ok: true, url: "https://github.com/alice" });
    expect(normalizeSocialUrl("instagram", "@a.b")).toEqual({ ok: true, url: "https://instagram.com/a.b" });
  });

  it("keeps a host such as github.com a host instead of a handle", () => {
    expect(normalizeSocialUrl("github", "github.com/alice")).toEqual({
      ok: true,
      url: "https://github.com/alice",
    });
  });

  it("accepts full URLs on the platform's hosts and subdomains, forcing https", () => {
    expect(normalizeSocialUrl("youtube", "http://www.youtube.com/@alice")).toEqual({
      ok: true,
      url: "https://www.youtube.com/@alice",
    });
    expect(normalizeSocialUrl("youtube", "https://youtu.be/abc")).toMatchObject({ ok: true });
    expect(normalizeSocialUrl("spotify", "https://open.spotify.com/artist/1?si=2")).toEqual({
      ok: true,
      url: "https://open.spotify.com/artist/1?si=2",
    });
    expect(normalizeSocialUrl("x", "https://twitter.com/alice")).toMatchObject({ ok: true });
  });

  it("refuses a platform button that points at another site", () => {
    expect(normalizeSocialUrl("spotify", "https://evil.example/open.spotify.com")).toEqual({
      ok: false,
      error: "This does not look like a link to Spotify",
    });
    expect(normalizeSocialUrl("instagram", "https://notinstagram.com/alice")).toMatchObject({ ok: false });
    expect(normalizeSocialUrl("instagram", "https://instagram.com.evil.example/alice")).toMatchObject({
      ok: false,
    });
  });

  it("refuses credentials, non-http schemes and junk", () => {
    expect(normalizeSocialUrl("website", "https://user:pw@example.com")).toMatchObject({ ok: false });
    expect(normalizeSocialUrl("website", "javascript:alert(1)")).toMatchObject({ ok: false });
    expect(normalizeSocialUrl("website", "ftp://example.com")).toMatchObject({ ok: false });
    expect(normalizeSocialUrl("website", "   ")).toMatchObject({ ok: false });
    expect(normalizeSocialUrl("website", "localhost")).toMatchObject({ ok: false });
    expect(normalizeSocialUrl("website", `https://example.com/${"a".repeat(3000)}`)).toMatchObject({
      ok: false,
    });
  });

  it("websites accept any host, add https and drop the fragment but keep http when given", () => {
    expect(normalizeSocialUrl("website", "example.com/me#top")).toEqual({
      ok: true,
      url: "https://example.com/me",
    });
    expect(normalizeSocialUrl("website", "http://example.com")).toEqual({
      ok: true,
      url: "http://example.com/",
    });
  });

  it("emails become mailto links and are validated", () => {
    expect(normalizeSocialUrl("email", "me@example.com")).toEqual({ ok: true, url: "mailto:me@example.com" });
    expect(normalizeSocialUrl("email", "mailto:me@example.com")).toEqual({
      ok: true,
      url: "mailto:me@example.com",
    });
    expect(normalizeSocialUrl("email", "not-an-email")).toMatchObject({ ok: false });
    expect(normalizeSocialUrl("email", "a b@example.com")).toMatchObject({ ok: false });
  });

  it("covers every platform", () => {
    for (const platform of SOCIAL_PLATFORMS) {
      expect(normalizeSocialUrl(platform, "")).toMatchObject({ ok: false });
    }
  });
});

describe("palettes", () => {
  /** Hue in degrees and HSL saturation of a #rrggbb colour. */
  function hueSat(hex: string): { hue: number; sat: number } {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
      number,
      number,
      number,
    ];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const light = (max + min) / 2;
    const delta = max - min;
    if (delta === 0) return { hue: 0, sat: 0 };
    const sat = delta / (1 - Math.abs(2 * light - 1));
    let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    return { hue, sat };
  }

  it("has a valid key for every palette", () => {
    for (const key of PALETTE_KEYS) expect(isPaletteKey(key)).toBe(true);
    expect(isPaletteKey("orange")).toBe(false);
    expect(Object.keys(PALETTES).sort()).toEqual([...PALETTE_KEYS].sort());
  });

  it.each(PALETTE_KEYS)("%s keeps text readable (AAA body text, AA secondary and buttons)", (key) => {
    const p = PALETTES[key];
    expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(p.muted, p.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(p.buttonFg, p.button)).toBeGreaterThanOrEqual(7);
  });

  it.each(PALETTE_KEYS)("%s uses no orange", (key) => {
    const p = PALETTES[key];
    for (const colour of [p.bg, p.fg, p.muted, p.button, p.buttonFg, p.accent]) {
      const { hue, sat } = hueSat(colour);
      const isOrange = hue >= 15 && hue <= 50 && sat >= 0.45;
      expect(isOrange, `${key} ${colour}`).toBe(false);
    }
  });
});

describe("bio form schemas", () => {
  const valid = {
    handle: "alice",
    displayName: "Alice",
    bio: "Maker",
    avatarUrl: "",
    theme: "paper" as const,
    socials: [],
    showBadge: true,
    isPublished: false,
  };

  it("accepts a sensible page", () => {
    expect(saveBioProfileSchema.safeParse(valid).success).toBe(true);
  });

  it("enforces the text limits, counting characters rather than UTF-16 units", () => {
    expect(saveBioProfileSchema.safeParse({ ...valid, bio: "x".repeat(LIMITS.bioTextMax + 1) }).success).toBe(
      false,
    );
    expect(saveBioProfileSchema.safeParse({ ...valid, bio: "x".repeat(LIMITS.bioTextMax) }).success).toBe(
      true,
    );
    expect(saveBioProfileSchema.safeParse({ ...valid, bio: "🙂".repeat(LIMITS.bioTextMax) }).success).toBe(
      true,
    );
    expect(
      saveBioProfileSchema.safeParse({ ...valid, displayName: "x".repeat(LIMITS.bioDisplayNameMax + 1) })
        .success,
    ).toBe(false);
    expect(
      addBioButtonSchema.safeParse({
        label: "x".repeat(LIMITS.bioButtonLabelMax + 1),
        url: "https://a.example",
      }).success,
    ).toBe(false);
    expect(
      addBioButtonSchema.safeParse({ label: "x".repeat(LIMITS.bioButtonLabelMax), url: "https://a.example" })
        .success,
    ).toBe(true);
  });

  it("rejects reserved handles, non-https pictures, bad socials and too many socials", () => {
    expect(saveBioProfileSchema.safeParse({ ...valid, handle: "admin" }).success).toBe(false);
    expect(saveBioProfileSchema.safeParse({ ...valid, avatarUrl: "http://a.example/p.png" }).success).toBe(
      false,
    );
    expect(
      saveBioProfileSchema.safeParse({
        ...valid,
        socials: [{ platform: "spotify", value: "https://evil.example" }],
      }).success,
    ).toBe(false);
    expect(
      saveBioProfileSchema.safeParse({ ...valid, socials: [{ platform: "github", value: "" }] }).success,
    ).toBe(true);
    const many = Array.from({ length: LIMITS.bioSocialsMax + 1 }, () => ({
      platform: "github" as const,
      value: "alice",
    }));
    expect(saveBioProfileSchema.safeParse({ ...valid, socials: many }).success).toBe(false);
  });

  it("requires a label and a real URL for a button", () => {
    expect(addBioButtonSchema.safeParse({ label: " ", url: "https://a.example" }).success).toBe(false);
    expect(addBioButtonSchema.safeParse({ label: "Shop", url: "javascript:alert(1)" }).success).toBe(false);
    expect(addBioButtonSchema.safeParse({ label: "Shop", url: "https://a.example" }).success).toBe(true);
  });
});
