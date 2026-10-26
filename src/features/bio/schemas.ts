import { z } from "zod";
import { charLimit } from "@/lib/char-limit";
import { handleProblem, normalizeHandle, normalizeSocialUrl, SOCIAL_PLATFORMS } from "@/lib/bio";
import { LIMITS } from "@/lib/constants";
import { PALETTE_KEYS } from "@/lib/palettes";
import { destinationUrlSchema } from "@/features/links/schemas";

/**
 * Schemas shared by the bio editor (react-hook-form) and its server actions. `BioService` repeats
 * every rule, so these exist to give people feedback as they type, not to be the only check.
 */

export const bioHandleSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const problem = handleProblem(normalizeHandle(value));
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

export const socialRowSchema = z
  .object({
    platform: z.enum(SOCIAL_PLATFORMS),
    value: z
      .string()
      .trim()
      .max(LIMITS.urlMaxLength, `Links can be at most ${LIMITS.urlMaxLength} characters`),
  })
  .superRefine((row, ctx) => {
    // A blank row is simply dropped on save.
    if (!row.value) return;
    const result = normalizeSocialUrl(row.platform, row.value);
    if (!result.ok) ctx.addIssue({ code: "custom", path: ["value"], message: result.error });
  });

const optionalHttpsUrl = z
  .string()
  .trim()
  .max(LIMITS.urlMaxLength)
  .refine((value) => {
    if (!value) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use a link that starts with https://");

export const saveBioProfileSchema = z.object({
  handle: bioHandleSchema,
  displayName: z
    .string()
    .trim()
    .refine(
      ...charLimit(
        LIMITS.bioDisplayNameMax,
        `The name can be at most ${LIMITS.bioDisplayNameMax} characters`,
      ),
    ),
  bio: z
    .string()
    .trim()
    .refine(...charLimit(LIMITS.bioTextMax, `The bio can be at most ${LIMITS.bioTextMax} characters`)),
  avatarUrl: optionalHttpsUrl,
  theme: z.enum(PALETTE_KEYS),
  socials: z.array(socialRowSchema).max(LIMITS.bioSocialsMax, `At most ${LIMITS.bioSocialsMax} social links`),
  showBadge: z.boolean(),
  isPublished: z.boolean(),
});
export type SaveBioProfileInput = z.infer<typeof saveBioProfileSchema>;

export const checkBioHandleSchema = z.object({ handle: z.string().trim().max(100) });

export const bioButtonLabelSchema = z
  .string()
  .trim()
  .min(1, "Give the button a label")
  .refine(
    ...charLimit(LIMITS.bioButtonLabelMax, `Labels can be at most ${LIMITS.bioButtonLabelMax} characters`),
  );

export const addBioButtonSchema = z.object({
  label: bioButtonLabelSchema,
  url: destinationUrlSchema,
});

export const updateBioButtonSchema = z.object({
  id: z.string().min(1),
  label: bioButtonLabelSchema.optional(),
  url: destinationUrlSchema.optional(),
  isVisible: z.boolean().optional(),
});

export const reorderBioButtonsSchema = z.object({
  ids: z.array(z.string().min(1)).max(LIMITS.bioButtonsMax),
});

export const removeBioButtonSchema = z.object({ id: z.string().min(1) });
