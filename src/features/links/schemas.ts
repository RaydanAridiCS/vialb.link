import { z } from "zod";
import {
  ACCESS_LIMIT_PRESETS,
  CUSTOM_CODE_PATTERN,
  DEFAULT_QR_BG,
  DEFAULT_QR_FG,
  EXPIRATION_PRESETS,
  HEX_COLOR_PATTERN,
  LIMITS,
  RESERVED_CODES,
} from "@/lib/constants";
import { DEFAULT_QR_ECC, isScannable, QR_ECC_LEVELS, QR_FRAME_TEXT_MAX, QR_FRAMES } from "@/lib/qr-options";
import { isValidTag, normalizeTag } from "@/lib/tags";

/**
 * Schemas shared by the client forms (react-hook-form), server actions and
 * the REST API. Server-only rules (blocklist, own host, Safe Browsing) are
 * enforced again in the service layer.
 */

export const destinationUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter a URL")
  .max(LIMITS.urlMaxLength, `URLs can be at most ${LIMITS.urlMaxLength} characters`)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
    } catch {
      return false;
    }
  }, "Enter a valid http:// or https:// URL");

export const customCodeSchema = z
  .string()
  .trim()
  .regex(CUSTOM_CODE_PATTERN, "3-50 characters: letters, numbers, - or _")
  .refine((value) => !RESERVED_CODES.has(value.toLowerCase()), "This code is reserved");

export const hexColorSchema = z.string().regex(HEX_COLOR_PATTERN, "Use a hex color like #1A2B3C");

export const qrEccSchema = z.enum(QR_ECC_LEVELS);
export const qrFrameSchema = z.enum(QR_FRAMES);
/** Empty means "use the default text". */
export const qrFrameTextSchema = z
  .string()
  .trim()
  .max(QR_FRAME_TEXT_MAX, `At most ${QR_FRAME_TEXT_MAX} characters`);

/** Refuses colour pairs no scanner can read; softer problems are only warned about in the UI. */
function refineQrColors(value: { qrFgColor: string; qrBgColor: string }, ctx: z.RefinementCtx) {
  if (
    HEX_COLOR_PATTERN.test(value.qrFgColor) &&
    HEX_COLOR_PATTERN.test(value.qrBgColor) &&
    !isScannable(value.qrFgColor, value.qrBgColor)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["qrFgColor"],
      message: "These colours are too similar to scan. Pick a darker foreground.",
    });
  }
}

export const httpsUrlSchema = z
  .string()
  .trim()
  .max(LIMITS.urlMaxLength)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be an https:// URL (uploads/base64 are not supported)");

/** Accepts what people type (`#Promo`, `client work`); the service stores the normalized form. */
export const tagSchema = z.string().refine((value) => isValidTag(normalizeTag(value)), {
  message: `Tags are up to ${LIMITS.tagMaxLength} letters, numbers, - or _`,
});

const tagsSchema = z.array(tagSchema).max(LIMITS.tagsPerLinkMax, `At most ${LIMITS.tagsPerLinkMax} tags`);

const optionalText = (max: number) => z.string().trim().max(max, `At most ${max} characters`).optional();

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date and time");

const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, `At least ${LIMITS.passwordMin} characters`)
  .max(LIMITS.passwordMax, `At most ${LIMITS.passwordMax} characters`);

/** Shared advanced fields for create + edit forms. Strings so form state stays simple. */
const linkFieldsShape = {
  destinationUrl: destinationUrlSchema,
  title: optionalText(LIMITS.titleMax),
  tags: tagsSchema,
  expiresAt: dateString.optional().or(z.literal("")),
  accessLimit: z.enum(ACCESS_LIMIT_PRESETS),
  maxClicks: z.string().optional(),
  ogTitle: optionalText(LIMITS.ogTitleMax),
  ogDescription: optionalText(LIMITS.ogDescriptionMax),
  ogImageUrl: httpsUrlSchema.optional().or(z.literal("")),
  qrFgColor: hexColorSchema,
  qrBgColor: hexColorSchema,
  qrEcc: qrEccSchema,
  qrFrame: qrFrameSchema,
  qrFrameText: qrFrameTextSchema,
};

function refineLimits(
  value: { accessLimit: string; maxClicks?: string; expiration: string; expiresAt?: string },
  ctx: z.RefinementCtx,
) {
  if (value.accessLimit === "custom") {
    const n = Number(value.maxClicks);
    if (!Number.isInteger(n) || n < LIMITS.maxClicksMin || n > LIMITS.maxClicksMax) {
      ctx.addIssue({
        code: "custom",
        path: ["maxClicks"],
        message: `Enter a whole number between ${LIMITS.maxClicksMin} and ${LIMITS.maxClicksMax.toLocaleString("en-US")}`,
      });
    }
  }
  if (value.expiration === "custom" && !value.expiresAt) {
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Pick a date and time" });
  }
}

export const createLinkSchema = z
  .object({
    ...linkFieldsShape,
    customCode: customCodeSchema.optional().or(z.literal("")),
    expiration: z.enum(EXPIRATION_PRESETS),
    password: passwordSchema.optional().or(z.literal("")),
    captchaToken: z.string().max(4096).optional(),
  })
  .superRefine((value, ctx) => {
    refineLimits(value, ctx);
    refineQrColors(value, ctx);
  });

export type CreateLinkFormValues = z.input<typeof createLinkSchema>;

export const EDIT_EXPIRATION_OPTIONS = ["keep", ...EXPIRATION_PRESETS] as const;

export const updateLinkSchema = z
  .object({
    ...linkFieldsShape,
    id: z.uuid(),
    expiration: z.enum(EDIT_EXPIRATION_OPTIONS),
    passwordAction: z.enum(["keep", "set", "remove"]),
    password: z.string().max(LIMITS.passwordMax).optional(),
    isEnabled: z.boolean(),
  })
  .superRefine((value, ctx) => {
    refineLimits(value, ctx);
    refineQrColors(value, ctx);
    if (value.passwordAction === "set" && !passwordSchema.safeParse(value.password ?? "").success) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: `Password must be ${LIMITS.passwordMin}-${LIMITS.passwordMax} characters`,
      });
    }
  });

export type UpdateLinkFormValues = z.input<typeof updateLinkSchema>;

export const quickCreateSchema = z.object({
  destinationUrl: destinationUrlSchema,
  captchaToken: z.string().max(4096).optional(),
});

export const linkIdsSchema = z.object({ ids: z.array(z.uuid()).min(1).max(500) });
export const setEnabledSchema = linkIdsSchema.extend({ enabled: z.boolean() });
export const claimSchema = z.object({ tokens: z.array(z.string().min(16).max(64)).max(100) });

export const linkListParamsSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  tag: z.string().trim().max(LIMITS.tagMaxLength).optional().catch(undefined),
  status: z.enum(["all", "active", "expired", "disabled", "protected"]).optional().catch(undefined),
  sort: z.enum(["created_desc", "created_asc", "clicks_desc", "clicks_asc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100000).optional().catch(undefined),
  pageSize: z.coerce.number().int().min(5).max(LIMITS.pageSizeMax).optional().catch(undefined),
});

export const DEFAULT_LINK_FORM: CreateLinkFormValues = {
  destinationUrl: "",
  customCode: "",
  title: "",
  tags: [],
  expiration: "never",
  expiresAt: "",
  accessLimit: "unlimited",
  maxClicks: "",
  password: "",
  ogTitle: "",
  ogDescription: "",
  ogImageUrl: "",
  qrFgColor: DEFAULT_QR_FG,
  qrBgColor: DEFAULT_QR_BG,
  qrEcc: DEFAULT_QR_ECC,
  qrFrame: "none",
  qrFrameText: "",
};

/** Converts the access-limit preset fields into a concrete limit. */
export function resolveMaxClicks(accessLimit: string, maxClicks?: string): number | null {
  if (accessLimit === "unlimited") return null;
  if (accessLimit === "custom") return Number(maxClicks);
  return Number(accessLimit);
}

export function emptyToNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * CSV import payloads. The client already validated these rows, but nothing here is trusted: the
 * limits only bound the request size, and `LinkService.importLinks` applies the real rules per row
 * so one bad row becomes a row error instead of failing the whole batch.
 */
const importRowShape = z.object({
  row: z.number().int().min(1).max(10_000_000),
  url: z.string().max(LIMITS.urlMaxLength * 2),
  title: z.string().max(LIMITS.titleMax * 5),
  code: z.string().max(200),
  tags: z.array(z.string().max(200)).max(LIMITS.tagsPerLinkMax * 5),
});

export const importLinksSchema = z.object({
  rows: z.array(importRowShape).min(1).max(LIMITS.importBatchSize),
});

export const checkImportCodesSchema = z.object({
  items: z
    .array(z.object({ code: z.string().min(1).max(200), url: z.string().max(LIMITS.urlMaxLength * 2) }))
    .max(LIMITS.importMaxRows),
});

export const qrOptionsSchema = z
  .object({
    id: z.uuid(),
    qrFgColor: hexColorSchema,
    qrBgColor: hexColorSchema,
    qrEcc: qrEccSchema,
    qrFrame: qrFrameSchema,
    qrFrameText: qrFrameTextSchema,
  })
  .superRefine(refineQrColors);
