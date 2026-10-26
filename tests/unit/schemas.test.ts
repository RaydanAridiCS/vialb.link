import { describe, expect, it } from "vitest";
import {
  createLinkSchema,
  customCodeSchema,
  DEFAULT_LINK_FORM,
  destinationUrlSchema,
  httpsUrlSchema,
  linkListParamsSchema,
  resolveMaxClicks,
  updateLinkSchema,
} from "@/features/links/schemas";

describe("destinationUrlSchema", () => {
  it.each(["https://example.com", "http://example.com/a?b=c#d", "https://sub.example.co.uk:8443/x"])(
    "accepts %s",
    (url) => expect(destinationUrlSchema.safeParse(url).success).toBe(true),
  );

  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "ftp://example.com",
    "vbscript:msgbox",
    "example.com",
    "",
    "https://",
  ])("rejects %s", (url) => expect(destinationUrlSchema.safeParse(url).success).toBe(false));

  it("rejects URLs longer than 2048 characters", () => {
    expect(destinationUrlSchema.safeParse(`https://e.com/${"a".repeat(2048)}`).success).toBe(false);
  });
});

describe("customCodeSchema", () => {
  it("accepts valid codes", () => {
    for (const code of ["abc", "My-Link_2", "a".repeat(50)])
      expect(customCodeSchema.safeParse(code).success).toBe(true);
  });
  it("rejects bad characters and lengths", () => {
    for (const code of ["ab", "a".repeat(51), "has space", "slash/x", "émoji", "dot.x"]) {
      expect(customCodeSchema.safeParse(code).success).toBe(false);
    }
  });
  it("rejects reserved codes case-insensitively", () => {
    for (const code of ["api", "API", "Dashboard", "sign-in", "gone", "docs", "admin"]) {
      expect(customCodeSchema.safeParse(code).success).toBe(false);
    }
  });
});

describe("createLinkSchema", () => {
  const valid = { ...DEFAULT_LINK_FORM, destinationUrl: "https://example.com" };

  it("accepts the default form", () => {
    expect(createLinkSchema.safeParse(valid).success).toBe(true);
  });
  it("requires a custom max-clicks value within 1-100000", () => {
    expect(createLinkSchema.safeParse({ ...valid, accessLimit: "custom", maxClicks: "" }).success).toBe(
      false,
    );
    expect(createLinkSchema.safeParse({ ...valid, accessLimit: "custom", maxClicks: "0" }).success).toBe(
      false,
    );
    expect(createLinkSchema.safeParse({ ...valid, accessLimit: "custom", maxClicks: "100001" }).success).toBe(
      false,
    );
    expect(createLinkSchema.safeParse({ ...valid, accessLimit: "custom", maxClicks: "2.5" }).success).toBe(
      false,
    );
    expect(createLinkSchema.safeParse({ ...valid, accessLimit: "custom", maxClicks: "500" }).success).toBe(
      true,
    );
  });
  it("requires a date for custom expiration", () => {
    expect(createLinkSchema.safeParse({ ...valid, expiration: "custom" }).success).toBe(false);
    expect(
      createLinkSchema.safeParse({ ...valid, expiration: "custom", expiresAt: "2030-01-01T10:00" }).success,
    ).toBe(true);
  });
  it("enforces password length and text limits", () => {
    expect(createLinkSchema.safeParse({ ...valid, password: "abc" }).success).toBe(false);
    expect(createLinkSchema.safeParse({ ...valid, password: "abcd" }).success).toBe(true);
    expect(createLinkSchema.safeParse({ ...valid, password: "x".repeat(129) }).success).toBe(false);
    expect(createLinkSchema.safeParse({ ...valid, title: "x".repeat(101) }).success).toBe(false);
    expect(createLinkSchema.safeParse({ ...valid, ogTitle: "x".repeat(71) }).success).toBe(false);
    expect(createLinkSchema.safeParse({ ...valid, ogDescription: "x".repeat(201) }).success).toBe(false);
  });
  it("only accepts https OG images and hex colours", () => {
    expect(createLinkSchema.safeParse({ ...valid, ogImageUrl: "http://x.com/a.png" }).success).toBe(false);
    expect(createLinkSchema.safeParse({ ...valid, ogImageUrl: "data:image/png;base64,AAAA" }).success).toBe(
      false,
    );
    expect(createLinkSchema.safeParse({ ...valid, ogImageUrl: "https://x.com/a.png" }).success).toBe(true);
    expect(createLinkSchema.safeParse({ ...valid, qrFgColor: "red" }).success).toBe(false);
    expect(httpsUrlSchema.safeParse("not a url").success).toBe(false);
  });
});

describe("updateLinkSchema", () => {
  const base = {
    ...DEFAULT_LINK_FORM,
    id: "0192f0c4-8b8e-7c1a-9d3e-1234567890ab",
    destinationUrl: "https://example.com",
    expiration: "keep" as const,
    passwordAction: "keep" as const,
    isEnabled: true,
  };
  it("requires a valid password only when setting one", () => {
    expect(updateLinkSchema.safeParse(base).success).toBe(true);
    expect(updateLinkSchema.safeParse({ ...base, passwordAction: "set", password: "ab" }).success).toBe(
      false,
    );
    expect(updateLinkSchema.safeParse({ ...base, passwordAction: "set", password: "abcd" }).success).toBe(
      true,
    );
    expect(updateLinkSchema.safeParse({ ...base, passwordAction: "remove" }).success).toBe(true);
  });
});

describe("helpers", () => {
  it("resolves access-limit presets", () => {
    expect(resolveMaxClicks("unlimited")).toBeNull();
    expect(resolveMaxClicks("100")).toBe(100);
    expect(resolveMaxClicks("custom", "42")).toBe(42);
  });
  it("parses list params leniently", () => {
    expect(linkListParamsSchema.parse({ page: "2", status: "bogus", sort: "clicks_desc" })).toEqual({
      page: 2,
      status: undefined,
      sort: "clicks_desc",
    });
  });
});

describe("link form: routing rules and card design", () => {
  const valid = { ...DEFAULT_LINK_FORM, destinationUrl: "https://example.com" };

  it("defaults to neither", () => {
    expect(DEFAULT_LINK_FORM.routingRules).toEqual([]);
    expect(DEFAULT_LINK_FORM.cardDesign).toBeNull();
    expect(createLinkSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts rules typed with lower-case countries and a complete design", () => {
    const result = createLinkSchema.safeParse({
      ...valid,
      routingRules: [{ platform: "ios", countries: ["fr", " de"], url: "https://apps.apple.com/app/id1" }],
      cardDesign: { template: "split", palette: "plum", headline: "Hello", subline: "", showHost: false },
    });
    expect(result.success).toBe(true);
  });

  it("puts a problem with a rule on that rule's device field, next to a bad URL", () => {
    const result = createLinkSchema.safeParse({
      ...valid,
      routingRules: [{ url: "javascript:alert(1)" }],
    });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join(".")) ?? [];
    expect(paths).toEqual(expect.arrayContaining(["routingRules.0.url", "routingRules.0.platform"]));
  });

  it("explains an empty headline", () => {
    const result = createLinkSchema.safeParse({
      ...valid,
      cardDesign: { template: "plain", palette: "ink", headline: "  ", subline: "", showHost: true },
    });
    expect(result.error?.issues[0]?.message).toBe("Add a headline for the card");
  });

  it("is the same in the edit form", () => {
    const base = {
      ...DEFAULT_LINK_FORM,
      id: crypto.randomUUID(),
      expiration: "keep",
      passwordAction: "keep",
      isEnabled: true,
    };
    expect(
      updateLinkSchema.safeParse({
        ...base,
        destinationUrl: "https://e.com",
        routingRules: [],
        cardDesign: null,
      }).success,
    ).toBe(true);
    expect(
      updateLinkSchema.safeParse({
        ...base,
        destinationUrl: "https://e.com",
        routingRules: [{ countries: ["us"], url: "ftp://nope" }],
      }).success,
    ).toBe(false);
  });
});
