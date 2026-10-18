"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LIMITS } from "@/lib/constants";
import { getContainer } from "@/server/container";
import { authActionClient } from "@/server/http/safe-action";

export const createApiKeyAction = authActionClient
  .metadata({ name: "create-api-key" })
  .inputSchema(z.object({ name: z.string().trim().min(1, "Give the key a name").max(LIMITS.apiKeyNameMax) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await getContainer().apiKeys.create(ctx.actor, parsedInput.name);
    revalidatePath("/dashboard/api-keys");
    return result;
  });

export const revokeApiKeyAction = authActionClient
  .metadata({ name: "revoke-api-key" })
  .inputSchema(z.object({ id: z.uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    await getContainer().apiKeys.revoke(ctx.actor, parsedInput.id);
    revalidatePath("/dashboard/api-keys");
    return { revoked: true };
  });
