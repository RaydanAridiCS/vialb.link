"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { getContainer } from "@/server/container";
import { ValidationError } from "@/server/errors";
import { adminActionClient } from "@/server/http/safe-action";

const nullableBool = z.enum(["default", "on", "off"]).transform((v) => (v === "default" ? null : v === "on"));

export const updateInstanceSettingsAction = adminActionClient
  .metadata({ name: "update-instance-settings" })
  .inputSchema(
    z.object({
      allowAnonymousLinks: nullableBool,
      allowSignups: nullableBool,
      pixelsEnabled: nullableBool,
      anonLinkTtlHours: z.union([z.literal(""), z.coerce.number().int().min(1).max(8760)]),
      blockedDomains: z.string().max(200_000),
      blockedDomainsMode: z.enum(["default", "custom"]),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const settings = await getContainer().settings.update(ctx.actor, {
      allowAnonymousLinks: parsedInput.allowAnonymousLinks,
      allowSignups: parsedInput.allowSignups,
      pixelsEnabled: parsedInput.pixelsEnabled,
      anonLinkTtlHours: parsedInput.anonLinkTtlHours === "" ? null : parsedInput.anonLinkTtlHours,
      blockedDomains:
        parsedInput.blockedDomainsMode === "default" ? null : parsedInput.blockedDomains.split(/[\s,]+/),
    });
    revalidatePath("/admin");
    revalidatePath("/");
    return { settings };
  });

const userIdSchema = z.object({ userId: z.string().min(1).max(200) });

export const banUserAction = adminActionClient
  .metadata({ name: "ban-user" })
  .inputSchema(userIdSchema.extend({ reason: z.string().max(200).optional() }))
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.userId === ctx.actor.userId) throw new ValidationError("You can't ban yourself");
    await auth.api.banUser({
      body: { userId: parsedInput.userId, banReason: parsedInput.reason || "Banned by an administrator" },
      headers: await headers(),
    });
    revalidatePath("/admin/users");
    return { ok: true };
  });

export const unbanUserAction = adminActionClient
  .metadata({ name: "unban-user" })
  .inputSchema(userIdSchema)
  .action(async ({ parsedInput }) => {
    await auth.api.unbanUser({ body: { userId: parsedInput.userId }, headers: await headers() });
    revalidatePath("/admin/users");
    return { ok: true };
  });

export const setUserRoleAction = adminActionClient
  .metadata({ name: "set-user-role" })
  .inputSchema(userIdSchema.extend({ role: z.enum(["user", "admin"]) }))
  .action(async ({ parsedInput, ctx }) => {
    if (parsedInput.userId === ctx.actor.userId && parsedInput.role !== "admin") {
      throw new ValidationError("You can't remove your own admin role");
    }
    await auth.api.setRole({
      body: { userId: parsedInput.userId, role: parsedInput.role },
      headers: await headers(),
    });
    revalidatePath("/admin/users");
    return { ok: true };
  });
