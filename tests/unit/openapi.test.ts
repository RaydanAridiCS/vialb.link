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
