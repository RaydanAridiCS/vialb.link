"use server";

import { revalidatePath } from "next/cache";
import { getContainer } from "@/server/container";
import { authActionClient, publicActionClient } from "@/server/http/safe-action";
import {
  checkImportCodesSchema,
  claimSchema,
  createLinkSchema,
  emptyToNull,
  importLinksSchema,
  linkIdsSchema,
  qrOptionsSchema,
  quickCreateSchema,
  resolveMaxClicks,
  setEnabledSchema,
  updateLinkSchema,
} from "./schemas";

function revalidateDashboard() {
  revalidatePath("/dashboard", "layout");
}

export const createLinkAction = authActionClient
  .metadata({ name: "create-link" })
  .inputSchema(createLinkSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const { links } = getContainer();
    const result = await links.create(
      ctx.actor,
      {
        destinationUrl: input.destinationUrl,
        customCode: input.customCode || undefined,
        title: emptyToNull(input.title),
        tags: input.tags,
        routingRules: input.routingRules,
        cardDesign: input.cardDesign,
        pixels: input.pixels,
        expiration: {
          preset: input.expiration,
          customAt: input.expiration === "custom" && input.expiresAt ? new Date(input.expiresAt) : null,
        },
        maxClicks: resolveMaxClicks(input.accessLimit, input.maxClicks),
        password: input.password || null,
        ogTitle: emptyToNull(input.ogTitle),
        ogDescription: emptyToNull(input.ogDescription),
        ogImageUrl: emptyToNull(input.ogImageUrl),
        qrFgColor: input.qrFgColor,
        qrBgColor: input.qrBgColor,
        qrEcc: input.qrEcc,
        qrFrame: input.qrFrame,
        qrFrameText: emptyToNull(input.qrFrameText),
      },
      { ip: ctx.ip, captchaToken: input.captchaToken },
    );
    revalidateDashboard();
    return result;
  });

/** Landing-page box: signed-in users get a normal link, visitors an anonymous one (if enabled). */
export const quickCreateLinkAction = publicActionClient
  .metadata({ name: "quick-create-link" })
  .inputSchema(quickCreateSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const result = await getContainer().links.create(
      ctx.actor,
      { destinationUrl: input.destinationUrl },
      { ip: ctx.ip, captchaToken: input.captchaToken },
    );
    if (ctx.actor.kind === "user") revalidateDashboard();
    return { ...result, signedIn: ctx.actor.kind === "user" };
  });

export const updateLinkAction = authActionClient
  .metadata({ name: "update-link" })
  .inputSchema(updateLinkSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const link = await getContainer().links.update(ctx.actor, input.id, {
      destinationUrl: input.destinationUrl,
      title: emptyToNull(input.title),
      tags: input.tags,
      routingRules: input.routingRules,
      cardDesign: input.cardDesign,
      pixels: input.pixels,
      expiration:
        input.expiration === "keep"
          ? undefined
          : {
              preset: input.expiration,
              customAt: input.expiration === "custom" && input.expiresAt ? new Date(input.expiresAt) : null,
            },
      maxClicks: resolveMaxClicks(input.accessLimit, input.maxClicks),
      password:
        input.passwordAction === "keep"
          ? undefined
          : input.passwordAction === "remove"
            ? null
            : (input.password ?? null),
      isEnabled: input.isEnabled,
      ogTitle: emptyToNull(input.ogTitle),
      ogDescription: emptyToNull(input.ogDescription),
      ogImageUrl: emptyToNull(input.ogImageUrl),
      qrFgColor: input.qrFgColor,
      qrBgColor: input.qrBgColor,
      qrEcc: input.qrEcc,
      qrFrame: input.qrFrame,
      qrFrameText: emptyToNull(input.qrFrameText),
    });
    revalidateDashboard();
    return { link };
  });

export const deleteLinksAction = authActionClient
  .metadata({ name: "delete-links" })
  .inputSchema(linkIdsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const deleted = await getContainer().links.delete(ctx.actor, parsedInput.ids);
    revalidateDashboard();
    revalidatePath("/admin", "layout");
    return { deleted };
  });

export const setLinksEnabledAction = authActionClient
  .metadata({ name: "set-links-enabled" })
  .inputSchema(setEnabledSchema)
  .action(async ({ parsedInput, ctx }) => {
    const updated = await getContainer().links.setEnabled(ctx.actor, parsedInput.ids, parsedInput.enabled);
    revalidateDashboard();
    revalidatePath("/admin", "layout");
    return { updated };
  });

export const saveQrOptionsAction = authActionClient
  .metadata({ name: "save-qr-options" })
  .inputSchema(qrOptionsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const link = await getContainer().links.update(ctx.actor, parsedInput.id, {
      qrFgColor: parsedInput.qrFgColor,
      qrBgColor: parsedInput.qrBgColor,
      qrEcc: parsedInput.qrEcc,
      qrFrame: parsedInput.qrFrame,
      qrFrameText: emptyToNull(parsedInput.qrFrameText),
    });
    revalidateDashboard();
    return { link };
  });

/** One batch of a CSV import; the browser sends the file's rows in chunks of `LIMITS.importBatchSize`. */
export const importLinksAction = authActionClient
  .metadata({ name: "import-links" })
  .inputSchema(importLinksSchema)
  .action(async ({ parsedInput, ctx }) => {
    const results = await getContainer().links.importLinks(
      ctx.actor,
      parsedInput.rows.map((row) => ({
        row: row.row,
        destinationUrl: row.url,
        customCode: row.code || undefined,
        title: emptyToNull(row.title),
        tags: row.tags,
      })),
    );
    if (results.some((result) => result.status === "created")) revalidateDashboard();
    return { results };
  });

export const checkImportCodesAction = authActionClient
  .metadata({ name: "check-import-codes" })
  .inputSchema(checkImportCodesSchema)
  .action(async ({ parsedInput, ctx }) =>
    getContainer().links.checkImportCodes(
      ctx.actor,
      parsedInput.items.map((item) => ({ code: item.code, destinationUrl: item.url })),
    ),
  );

export const claimLinksAction = authActionClient
  .metadata({ name: "claim-links" })
  .inputSchema(claimSchema)
  .action(async ({ parsedInput, ctx }) => {
    const claimed = await getContainer().links.claim(ctx.actor, parsedInput.tokens);
    if (claimed > 0) revalidateDashboard();
    return { claimed };
  });
