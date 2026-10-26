import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { APP_NAME, GITHUB_URL, RATE_LIMITS } from "@/lib/constants";
import {
  apiCreateLinkSchema,
  apiListQuerySchema,
  apiStatsQuerySchema,
  apiUpdateLinkSchema,
  errorSchema,
  linkListSchema,
  linkSchema,
  linkStatsSchema,
} from "./api-schemas";
import { qrEccSchema, qrFrameSchema, qrFrameTextSchema } from "./schemas";

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const errors = {
  400: json(errorSchema, "Validation error"),
  401: json(errorSchema, "Missing or invalid API key"),
  403: json(errorSchema, "Not allowed"),
  404: json(errorSchema, "Not found"),
  429: json(errorSchema, "Rate limit exceeded (see X-RateLimit-* and Retry-After headers)"),
};

/** Builds the OpenAPI 3.1 document from the same zod schemas the API validates with. */
export function buildOpenApiDocument(siteUrl: string) {
  const registry = new OpenAPIRegistry();
  const bearer = registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "Create an API key in Dashboard → API keys. Keys start with `tw_`.",
  });
  const security = [{ [bearer.name]: [] }];
  const idParam = z.object({ id: z.uuid().meta({ description: "Link id" }) });

  registry.registerPath({
    method: "get",
    path: "/api/v1/links",
    summary: "List links",
    tags: ["Links"],
    security,
    request: { query: apiListQuerySchema },
    responses: {
      200: json(linkListSchema, "A page of links, newest first"),
      401: errors[401],
      429: errors[429],
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/links",
    summary: "Create a link",
    description: "Always creates a new link, even if the destination was shortened before.",
    tags: ["Links"],
    security,
    request: { body: { content: { "application/json": { schema: apiCreateLinkSchema } } } },
    responses: {
      201: json(linkSchema, "The created link"),
      400: errors[400],
      401: errors[401],
      409: json(errorSchema, "Custom code already taken"),
      429: errors[429],
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/links/{id}",
    summary: "Get a link",
    tags: ["Links"],
    security,
    request: { params: idParam },
    responses: { 200: json(linkSchema, "The link"), 401: errors[401], 403: errors[403], 404: errors[404] },
  });
  registry.registerPath({
    method: "patch",
    path: "/api/v1/links/{id}",
    summary: "Update a link",
    description: "The short code is immutable. Send `null` to clear optional fields.",
    tags: ["Links"],
    security,
    request: { params: idParam, body: { content: { "application/json": { schema: apiUpdateLinkSchema } } } },
    responses: {
      200: json(linkSchema, "The updated link"),
      400: errors[400],
      401: errors[401],
      403: errors[403],
      404: errors[404],
    },
  });
  registry.registerPath({
    method: "delete",
    path: "/api/v1/links/{id}",
    summary: "Delete a link",
    description: "Soft delete: the link stops working and its code stays reserved.",
    tags: ["Links"],
    security,
    request: { params: idParam },
    responses: { 204: { description: "Deleted" }, 401: errors[401], 403: errors[403], 404: errors[404] },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/links/{id}/stats",
    summary: "Link statistics",
    description: "Human clicks only. Defaults to the last 30 days.",
    tags: ["Analytics"],
    security,
    request: { params: idParam, query: apiStatsQuerySchema },
    responses: { 200: json(linkStatsSchema, "Aggregated statistics"), 401: errors[401], 404: errors[404] },
  });
  for (const format of ["png", "svg"] as const) {
    registry.registerPath({
      method: "get",
      path: `/api/v1/links/{id}/qr.${format}`,
      summary: `QR code (${format.toUpperCase()})`,
      tags: ["QR codes"],
      security,
      request: {
        params: idParam,
        query: z.object({
          fg: z.string().optional().meta({ example: "#000000" }),
          bg: z.string().optional().meta({ example: "#FFFFFF" }),
          ecc: qrEccSchema
            .optional()
            .meta({ description: "Error correction level; defaults to the link's setting" }),
          frame: qrFrameSchema.optional().meta({ description: "`badge` adds a label under the code" }),
          frameText: qrFrameTextSchema.optional().meta({ example: "Scan me" }),
          ...(format === "png" ? { size: z.coerce.number().int().min(128).max(2048).optional() } : {}),
        }),
      },
      responses: {
        200: {
          description: "QR image",
          content: {
            [format === "png" ? "image/png" : "image/svg+xml"]: {
              schema: z.string().meta({ format: "binary" }),
            },
          },
        },
        401: errors[401],
        404: errors[404],
      },
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: `${APP_NAME} API`,
      version: "1.0.0",
      description: `Create and manage short links programmatically. Authenticate with \`Authorization: Bearer <api key>\`. Each key may make ${RATE_LIMITS.apiKey.limit} requests per minute.`,
      license: { name: "MIT", url: `${GITHUB_URL}/blob/main/LICENSE` },
    },
    servers: [{ url: siteUrl }],
    externalDocs: { url: GITHUB_URL, description: "Source code & repository" },
  });
}
