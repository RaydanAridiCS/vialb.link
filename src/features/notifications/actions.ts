"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContainer } from "@/server/container";
import { authActionClient } from "@/server/http/safe-action";

export const updateEmailPreferencesAction = authActionClient
  .metadata({ name: "update-email-preferences" })
  .inputSchema(z.object({ weeklyReport: z.boolean().optional(), brokenLinksEmail: z.boolean().optional() }))
  .action(async ({ parsedInput, ctx }) => {
    const preferences = await getContainer().reports.setPreferences(ctx.actor, parsedInput);
    revalidatePath("/dashboard/settings");
    return { preferences };
  });

export const sendReportPreviewAction = authActionClient
  .metadata({ name: "send-report-preview" })
  .inputSchema(z.object({}))
  .action(async ({ ctx }) => {
    await getContainer().reports.sendPreview(ctx.actor);
    return { ok: true };
  });
