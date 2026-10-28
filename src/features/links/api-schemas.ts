import { z } from "zod";
import { LIMITS } from "@/lib/constants";
import type { CreateLinkCommand, UpdateLinkCommand } from "@/server/services/link.service";
import { QR_ECC_LEVELS, QR_FRAME_TEXT_MAX, QR_FRAMES } from "@/lib/qr-options";
import { ROUTING_PLATFORMS } from "@/lib/routing";
import {
  customCodeSchema,
  destinationUrlSchema,
  cardDesignSchema,
  hexColorSchema,
  httpsUrlSchema,
  pixelsSchema,
  qrEccSchema,
  qrFrameSchema,
  qrFrameTextSchema,
  routingRulesSchema,
  tagSchema,
} from "./schemas";

/**
 * REST API v1 request/response schemas. Built from the same field validators
 * as the dashboard forms; `.meta()` feeds the generated OpenAPI 3.1 document.
 */

const password = z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax);
const tags = z.array(tagSchema).max(LIMITS.tagsPerLinkMax);
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
    tags: tags.optional().meta({
      description: "Labels for grouping links; stored lowercase",
      example: ["promo", "client-work"],
    }),
    routingRules: routingRulesSchema.optional().meta({
      description:
        "Smart routing: rules are checked in order and the first match replaces `url`. Each rule needs a `platform` (ios, android, desktop), `countries` (ISO codes), or both.",
      example: [{ platform: "ios", url: "https://apps.apple.com/app/id1" }],
    }),
    cardDesign: cardDesignSchema
      .nullable()
      .optional()
      .meta({
        description:
          "Designed social preview card (1200x630): a template (plain, gradient, split), a palette, a headline and an optional subtitle. Used as the link's preview image unless `ogImageUrl` is set.",
        example: {
          template: "gradient",
          palette: "forest",
          headline: "Spring sale",
          subline: "",
          showHost: true,
        },
      }),
    pixels: pixelsSchema
      .nullable()
      .optional()
      .meta({
        description:
          "Retargeting pixel IDs: `meta` (Meta Pixel, digits) and/or `google` (G-, AW- or GTM- tag). Visitors see a consent page first; only works while the instance has pixels enabled, and not on password-protected links.",
        example: { meta: "123456789012345", google: "G-ABCD1234" },
      }),
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
    qrEcc: qrEccSchema.optional().meta({
      description: "QR error correction level. New links default to H (densest, most robust).",
    }),
    qrFrame: qrFrameSchema.optional().meta({ description: "`badge` adds a label under the QR code" }),
    qrFrameText: qrFrameTextSchema.optional().meta({
      description: `Badge text, up to ${QR_FRAME_TEXT_MAX} characters (default "Scan me")`,
    }),
  })
  .meta({ id: "CreateLinkRequest" });

export const apiUpdateLinkSchema = z
  .object({
    url: destinationUrlSchema.optional(),
    title: z.string().trim().max(LIMITS.titleMax).nullable().optional(),
    tags: tags.optional().meta({ description: "Replaces all tags; omit to keep them" }),
    routingRules: routingRulesSchema
      .optional()
      .meta({ description: "Replaces all routing rules; send [] to remove them, omit to keep them" }),
    cardDesign: cardDesignSchema
      .nullable()
      .optional()
      .meta({ description: "null removes the card; omit to keep it" }),
    pixels: pixelsSchema
      .nullable()
      .optional()
      .meta({ description: "Replaces the pixels; null removes them, omit to keep them" }),
    expiresAt: z.iso
      .datetime({ offset: true })
      .nullable()
      .optional()
      .meta({ description: "null removes the expiry" }),
    maxClicks: maxClicks.nullable().optional().meta({ description: "null removes the limit" }),
    password: password.nullable().optional().meta({ description: "null removes the password" }),
    isEnabled: z.boolean().optional(),
    conversionsEnabled: z.boolean().optional().meta({
      description: "Turn conversion tracking on or off (see `Link.conversionsEnabled`).",
    }),
    publicStats: z.boolean().optional().meta({
      description:
        "`true` turns on the public, read-only stats page (the address is returned as `statsUrl`); `false` turns it off and the old address stops working.",
    }),
    ogTitle: z.string().trim().max(LIMITS.ogTitleMax).nullable().optional(),
    ogDescription: z.string().trim().max(LIMITS.ogDescriptionMax).nullable().optional(),
    ogImageUrl: httpsUrlSchema.nullable().optional(),
    qrFgColor: hexColorSchema.optional(),
    qrBgColor: hexColorSchema.optional(),
    qrEcc: qrEccSchema.optional(),
    qrFrame: qrFrameSchema.optional(),
    qrFrameText: qrFrameTextSchema
      .nullable()
      .optional()
      .meta({ description: "null resets to the default text" }),
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
    tags: z.array(z.string()),
    routingRules: z.array(
      z.object({
        platform: z.enum(ROUTING_PLATFORMS).optional(),
        countries: z.array(z.string()).optional(),
        url: z.string(),
      }),
    ),
    cardDesign: cardDesignSchema.nullable(),
    pixels: z.object({ meta: z.string().optional(), google: z.string().optional() }).nullable(),
    hasPassword: z.boolean(),
    conversionsEnabled: z.boolean().meta({
      description:
        "When on, visitors are sent to the destination with a random `vclid` parameter, which the destination can report back to `/api/convert` to count a conversion.",
    }),
    statsUrl: z.url().nullable().meta({
      description:
        "Address of the public, read-only stats page, or `null` while it is off. Set `publicStats` to change it.",
    }),
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
    qrEcc: z.enum(QR_ECC_LEVELS),
    qrFrame: z.enum(QR_FRAMES),
    qrFrameText: z.string().nullable(),
    health: z
      .object({
        state: z.enum(["ok", "failing", "flagged"]),
        needsAttention: z.boolean(),
        dismissed: z.boolean(),
        lastCheckedAt: z.string().nullable(),
        reason: z.string().nullable(),
        statusCode: z.number().int().nullable(),
        failingTarget: z.string().nullable(),
      })
      .nullable()
      .meta({
        description:
          "Result of the last destination check; `null` when the link was never checked or the instance's health monitor is off.",
      }),
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
    conversions: z
      .object({
        count: z.number().int(),
        eligibleClicks: z.number().int(),
        rate: z.number().nullable(),
        values: z.array(
          z.object({ currency: z.string(), totalMinor: z.number().int(), count: z.number().int() }),
        ),
      })
      .nullable()
      .optional()
      .meta({ description: "Only for links with conversion tracking; `rate` is a percent." }),
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
    tags: input.tags,
    routingRules: input.routingRules,
    cardDesign: input.cardDesign,
    pixels: input.pixels,
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
    qrEcc: input.qrEcc,
    qrFrame: input.qrFrame,
    qrFrameText: input.qrFrameText,
  };
}

export function toUpdateCommand(input: z.output<typeof apiUpdateLinkSchema>): UpdateLinkCommand {
  return {
    destinationUrl: input.url,
    title: input.title,
    tags: input.tags,
    routingRules: input.routingRules,
    cardDesign: input.cardDesign,
    pixels: input.pixels,
    expiration:
      input.expiresAt === undefined
        ? undefined
        : input.expiresAt === null
          ? { preset: "never" }
          : { preset: "custom", customAt: new Date(input.expiresAt) },
    maxClicks: input.maxClicks,
    password: input.password,
    isEnabled: input.isEnabled,
    publicStats: input.publicStats,
    conversionsEnabled: input.conversionsEnabled,
    ogTitle: input.ogTitle,
    ogDescription: input.ogDescription,
    ogImageUrl: input.ogImageUrl,
    qrFgColor: input.qrFgColor,
    qrBgColor: input.qrBgColor,
    qrEcc: input.qrEcc,
    qrFrame: input.qrFrame,
    qrFrameText: input.qrFrameText,
  };
}
