import { z } from "zod";
import { LIMITS } from "@/lib/constants";
import type { CreateLinkCommand, UpdateLinkCommand } from "@/server/services/link.service";
import { customCodeSchema, destinationUrlSchema, hexColorSchema, httpsUrlSchema } from "./schemas";

/**
 * REST API v1 request/response schemas. Built from the same field validators
 * as the dashboard forms; `.meta()` feeds the generated OpenAPI 3.1 document.
 */

const password = z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax);
const maxClicks = z.int().min(LIMITS.maxClicksMin).max(LIMITS.maxClicksMax);

export const apiCreateLinkSchema = z
  .object({
    url: destinationUrlSchema.meta({
      description: "Destination (http/https only)",
      example: "https://example.com/very/long/path",
    }),
    code: customCodeSchema
      .optional()
      .meta({ description: "Custom short code (case-sensitive)", example: "launch-2026" }),
    title: z.string().trim().max(LIMITS.titleMax).optional(),
    expiresAt: z.iso
      .datetime({ offset: true })
      .nullable()
      .optional()
      .meta({ description: "ISO-8601 expiry (≤ 1 year ahead)" }),
    maxClicks: maxClicks.nullable().optional().meta({ description: "Maximum successful redirects" }),
    password: password.optional().meta({ description: "Require this password before redirecting" }),
    ogTitle: z.string().trim().max(LIMITS.ogTitleMax).optional(),
    ogDescription: z.string().trim().max(LIMITS.ogDescriptionMax).optional(),
    ogImageUrl: httpsUrlSchema.optional(),
    qrFgColor: hexColorSchema.optional(),
    qrBgColor: hexColorSchema.optional(),
  })
  .meta({ id: "CreateLinkRequest" });

export const apiUpdateLinkSchema = z
  .object({
    url: destinationUrlSchema.optional(),
    title: z.string().trim().max(LIMITS.titleMax).nullable().optional(),
    expiresAt: z.iso
      .datetime({ offset: true })
      .nullable()
      .optional()
      .meta({ description: "null removes the expiry" }),
    maxClicks: maxClicks.nullable().optional().meta({ description: "null removes the limit" }),
    password: password.nullable().optional().meta({ description: "null removes the password" }),
    isEnabled: z.boolean().optional(),
    ogTitle: z.string().trim().max(LIMITS.ogTitleMax).nullable().optional(),
    ogDescription: z.string().trim().max(LIMITS.ogDescriptionMax).nullable().optional(),
    ogImageUrl: httpsUrlSchema.nullable().optional(),
    qrFgColor: hexColorSchema.optional(),
    qrBgColor: hexColorSchema.optional(),
  })
  .meta({ id: "UpdateLinkRequest" });

export const apiListQuerySchema = z.object({
  cursor: z.uuid().optional().meta({ description: "`nextCursor` from the previous page" }),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const apiStatsQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => (v.from === undefined) === (v.to === undefined), {
    message: "Provide both from and to, or neither",
  });

export const linkSchema = z
  .object({
    id: z.uuid(),
    code: z.string(),
    shortUrl: z.url(),
    destinationUrl: z.url(),
    title: z.string().nullable(),
    hasPassword: z.boolean(),
    expiresAt: z.string().nullable(),
    maxClicks: z.number().int().nullable(),
    clickCount: z.number().int(),
    isEnabled: z.boolean(),
    status: z.enum(["active", "expired", "limit_reached", "disabled"]),
    ogTitle: z.string().nullable(),
    ogDescription: z.string().nullable(),
    ogImageUrl: z.string().nullable(),
    qrFgColor: z.string(),
    qrBgColor: z.string(),
    ownerId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: "Link" });

export const linkListSchema = z
  .object({ data: z.array(linkSchema), nextCursor: z.string().nullable() })
  .meta({ id: "LinkList" });

const countSchema = z.object({ value: z.string(), clicks: z.number().int() });

export const linkStatsSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    bucket: z.enum(["hour", "day"]),
    totalClicks: z.number().int(),
    uniqueVisitors: z.number().int(),
    botClicks: z.number().int(),
    timeseries: z.array(z.object({ bucket: z.string(), clicks: z.number().int() })),
    countries: z.array(countSchema),
    referrers: z.array(countSchema),
  })
  .meta({ id: "LinkStats" });

export const errorSchema = z
  .object({
    error: z.object({
      code: z.enum([
        "VALIDATION_ERROR",
        "UNAUTHORIZED",
        "FORBIDDEN",
        "NOT_FOUND",
        "CONFLICT",
        "GONE",
        "RATE_LIMITED",
        "INTERNAL_ERROR",
      ]),
      message: z.string(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .meta({ id: "Error" });

export function toCreateCommand(input: z.output<typeof apiCreateLinkSchema>): CreateLinkCommand {
  return {
    destinationUrl: input.url,
    customCode: input.code,
    title: input.title ?? null,
    expiration: input.expiresAt
      ? { preset: "custom", customAt: new Date(input.expiresAt) }
      : { preset: "never" },
    maxClicks: input.maxClicks ?? null,
    password: input.password ?? null,
    ogTitle: input.ogTitle ?? null,
    ogDescription: input.ogDescription ?? null,
    ogImageUrl: input.ogImageUrl ?? null,
    qrFgColor: input.qrFgColor,
    qrBgColor: input.qrBgColor,
  };
}

export function toUpdateCommand(input: z.output<typeof apiUpdateLinkSchema>): UpdateLinkCommand {
  return {
    destinationUrl: input.url,
    title: input.title,
    expiration:
      input.expiresAt === undefined
        ? undefined
        : input.expiresAt === null
          ? { preset: "never" }
          : { preset: "custom", customAt: new Date(input.expiresAt) },
    maxClicks: input.maxClicks,
    password: input.password,
    isEnabled: input.isEnabled,
    ogTitle: input.ogTitle,
    ogDescription: input.ogDescription,
    ogImageUrl: input.ogImageUrl,
    qrFgColor: input.qrFgColor,
    qrBgColor: input.qrBgColor,
  };
}
