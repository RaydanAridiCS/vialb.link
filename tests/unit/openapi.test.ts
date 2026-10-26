import { describe, expect, it } from "vitest";
import {
  apiCreateLinkSchema,
  apiUpdateLinkSchema,
  toCreateCommand,
  toUpdateCommand,
} from "@/features/links/api-schemas";
import { buildOpenApiDocument } from "@/features/links/openapi";

describe("OpenAPI document", () => {
  it("generates a valid 3.1 document from the zod schemas", () => {
    const doc = buildOpenApiDocument("https://sho.rt");
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.servers).toEqual([{ url: "https://sho.rt" }]);
    expect(Object.keys(doc.paths ?? {})).toEqual(
      expect.arrayContaining([
        "/api/v1/links",
        "/api/v1/links/{id}",
        "/api/v1/links/{id}/stats",
        "/api/v1/links/{id}/qr.png",
        "/api/v1/links/{id}/qr.svg",
      ]),
    );
    expect(doc.components?.schemas).toHaveProperty("Link");
    expect(doc.components?.schemas).toHaveProperty("Error");
    expect(doc.components?.securitySchemes).toHaveProperty("bearerAuth");
  });
});

describe("API request mapping", () => {
  it("maps create requests to service commands", () => {
    const input = apiCreateLinkSchema.parse({
      url: "https://example.com",
      expiresAt: "2026-07-01T00:00:00Z",
      maxClicks: 5,
    });
    expect(toCreateCommand(input)).toMatchObject({
      destinationUrl: "https://example.com",
      expiration: { preset: "custom" },
      maxClicks: 5,
      password: null,
    });
    expect(toCreateCommand(apiCreateLinkSchema.parse({ url: "https://e.com" })).expiration).toEqual({
      preset: "never",
    });
    expect(apiCreateLinkSchema.safeParse({ url: "javascript:alert(1)" }).success).toBe(false);
    expect(apiCreateLinkSchema.safeParse({ url: "https://e.com", code: "api" }).success).toBe(false);
  });

  it("maps update requests, distinguishing undefined (keep) from null (clear)", () => {
    expect(toUpdateCommand(apiUpdateLinkSchema.parse({}))).toMatchObject({
      expiration: undefined,
      password: undefined,
    });
    expect(
      toUpdateCommand(apiUpdateLinkSchema.parse({ expiresAt: null, password: null, maxClicks: null })),
    ).toMatchObject({
      expiration: { preset: "never" },
      password: null,
      maxClicks: null,
    });
  });
});

describe("API: smart routing and social cards", () => {
  const card = { template: "gradient", palette: "forest", headline: "Sale", subline: "", showHost: true };
  const rules = [{ platform: "ios", url: "https://apps.apple.com/app/id1" }];

  it("documents both fields on create, update and the link itself", () => {
    const schemas = buildOpenApiDocument("https://sho.rt").components?.schemas ?? {};
    for (const name of ["CreateLinkRequest", "UpdateLinkRequest"]) {
      const properties = (schemas[name] as { properties?: Record<string, unknown> }).properties ?? {};
      expect(properties, name).toHaveProperty("routingRules");
      expect(properties, name).toHaveProperty("cardDesign");
    }
    const link = (schemas["Link"] as { properties?: Record<string, unknown>; required?: string[] }) ?? {};
    expect(link.properties).toHaveProperty("routingRules");
    expect(link.properties).toHaveProperty("cardDesign");
    expect(link.required).toEqual(expect.arrayContaining(["routingRules", "cardDesign"]));
  });

  it("passes both through to the service commands", () => {
    const create = toCreateCommand(
      apiCreateLinkSchema.parse({ url: "https://e.com", routingRules: rules, cardDesign: card }),
    );
    expect(create.routingRules).toEqual(rules);
    expect(create.cardDesign).toEqual(card);
  });

  it("keeps on update when omitted, replaces when given, clears with [] and null", () => {
    expect(toUpdateCommand(apiUpdateLinkSchema.parse({}))).toMatchObject({
      routingRules: undefined,
      cardDesign: undefined,
    });
    expect(
      toUpdateCommand(apiUpdateLinkSchema.parse({ routingRules: rules, cardDesign: card })),
    ).toMatchObject({
      routingRules: rules,
      cardDesign: card,
    });
    expect(toUpdateCommand(apiUpdateLinkSchema.parse({ routingRules: [], cardDesign: null }))).toMatchObject({
      routingRules: [],
      cardDesign: null,
    });
  });

  it("rejects bad rules and bad cards", () => {
    const badRules: unknown[] = [
      [{ url: "https://a.example" }],
      [{ platform: "windows", url: "https://a.example" }],
      [{ platform: "ios", url: "javascript:alert(1)" }],
      [{ countries: ["USA"], url: "https://a.example" }],
      [
        { platform: "ios", url: "https://a.example" },
        { platform: "ios", url: "https://b.example" },
      ],
      Array.from({ length: 11 }, (_, i) => ({
        countries: [`A${String.fromCharCode(65 + i)}`],
        url: "https://a.example",
      })),
    ];
    for (const routingRules of badRules) {
      expect(
        apiCreateLinkSchema.safeParse({ url: "https://e.com", routingRules }).success,
        JSON.stringify(routingRules),
      ).toBe(false);
    }
    const badCards: unknown[] = [
      { ...card, headline: "" },
      { ...card, headline: "x".repeat(81) },
      { ...card, subline: "x".repeat(101) },
      { ...card, palette: "orange" },
      { ...card, template: "fancy" },
      { ...card, showHost: "yes" },
      { palette: "ink" },
    ];
    for (const cardDesign of badCards) {
      expect(
        apiCreateLinkSchema.safeParse({ url: "https://e.com", cardDesign }).success,
        JSON.stringify(cardDesign),
      ).toBe(false);
    }
  });
});
