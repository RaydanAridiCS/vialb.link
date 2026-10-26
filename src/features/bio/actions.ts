"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContainer } from "@/server/container";
import { authActionClient } from "@/server/http/safe-action";
import {
  addBioButtonSchema,
  checkBioHandleSchema,
  removeBioButtonSchema,
  reorderBioButtonsSchema,
  saveBioProfileSchema,
  updateBioButtonSchema,
} from "./schemas";

function revalidateBio() {
  revalidatePath("/dashboard/bio");
}

export const saveBioProfileAction = authActionClient
  .metadata({ name: "save-bio-profile" })
  .inputSchema(saveBioProfileSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const profile = await getContainer().bio.saveProfile(ctx.actor, {
      handle: input.handle,
      displayName: input.displayName,
      bio: input.bio,
      avatarUrl: input.avatarUrl,
      theme: input.theme,
      socials: input.socials.filter((row) => row.value.length > 0),
      showBadge: input.showBadge,
      isPublished: input.isPublished,
    });
    revalidateBio();
    return { profile };
  });

export const checkBioHandleAction = authActionClient
  .metadata({ name: "check-bio-handle" })
  .inputSchema(checkBioHandleSchema)
  .action(async ({ parsedInput, ctx }) => getContainer().bio.checkHandle(ctx.actor, parsedInput.handle));

export const addBioButtonAction = authActionClient
  .metadata({ name: "add-bio-button" })
  .inputSchema(addBioButtonSchema)
  .action(async ({ parsedInput, ctx }) => {
    const button = await getContainer().bio.addButton(ctx.actor, parsedInput);
    revalidateBio();
    return { button };
  });

export const updateBioButtonAction = authActionClient
  .metadata({ name: "update-bio-button" })
  .inputSchema(updateBioButtonSchema)
  .action(async ({ parsedInput: { id, ...changes }, ctx }) => {
    const button = await getContainer().bio.updateButton(ctx.actor, id, changes);
    revalidateBio();
    return { button };
  });

export const removeBioButtonAction = authActionClient
  .metadata({ name: "remove-bio-button" })
  .inputSchema(removeBioButtonSchema)
  .action(async ({ parsedInput, ctx }) => {
    await getContainer().bio.removeButton(ctx.actor, parsedInput.id);
    revalidateBio();
    return { removed: true };
  });

export const reorderBioButtonsAction = authActionClient
  .metadata({ name: "reorder-bio-buttons" })
  .inputSchema(reorderBioButtonsSchema)
  .action(async ({ parsedInput, ctx }) => {
    await getContainer().bio.reorderButtons(ctx.actor, parsedInput.ids);
    revalidateBio();
    return { reordered: true };
  });

export const deleteBioPageAction = authActionClient
  .metadata({ name: "delete-bio-page" })
  .inputSchema(z.object({}))
  .action(async ({ ctx }) => {
    await getContainer().bio.deletePage(ctx.actor);
    revalidateBio();
    return { deleted: true };
  });
