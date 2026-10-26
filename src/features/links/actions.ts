"use server";

import { revalidatePath } from "next/cache";
import { getContainer } from "@/server/container";
import { authActionClient, publicActionClient } from "@/server/http/safe-action";
import {
  claimSchema,
  createLinkSchema,
  emptyToNull,
  linkIdsSchema,
  qrColorsSchema,
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

export const saveQrColorsAction = authActionClient
  .metadata({ name: "save-qr-colors" })
  .inputSchema(qrColorsSchema)
  .action(async ({ parsedInput, ctx }) => {
    const link = await getContainer().links.update(ctx.actor, parsedInput.id, {
      qrFgColor: parsedInput.qrFgColor,
      qrBgColor: parsedInput.qrBgColor,
    });
    revalidateDashboard();
    return { link };
  });

export const claimLinksAction = authActionClient
  .metadata({ name: "claim-links" })
  .inputSchema(claimSchema)
  .action(async ({ parsedInput, ctx }) => {
    const claimed = await getContainer().links.claim(ctx.actor, parsedInput.tokens);
    if (claimed > 0) revalidateDashboard();
    return { claimed };
  });
