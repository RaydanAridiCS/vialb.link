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
      healthMonitorEnabled: nullableBool,
      weeklyReportEnabled: nullableBool,
      reportSendDay: z.union([z.literal(""), z.coerce.number().int().min(0).max(6)]),
      reportSendHourUtc: z.union([z.literal(""), z.coerce.number().int().min(0).max(23)]),
      clickRetentionDays: z.union([z.literal(""), z.coerce.number().int().min(0).max(3650)]),
      requireAdmin2fa: nullableBool,
      branding: z.object({
        brandName: z.string().max(200),
        accentColor: z.string().max(20),
        logoUrl: z.string().max(1000),
        notFoundMessage: z.string().max(1000),
        goneMessage: z.string().max(1000),
        homeLabel: z.string().max(200),
        homeUrl: z.string().max(1000),
      }),
      anonLinkTtlHours: z.union([z.literal(""), z.coerce.number().int().min(1).max(8760)]),
      blockedDomains: z.string().max(200_000),
      blockedDomainsMode: z.enum(["default", "custom"]),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    // Switching the requirement on while you cannot meet it yourself would lock you out of this very page.
    if (parsedInput.requireAdmin2fa === true && ctx.session.user.twoFactorEnabled !== true) {
      throw new ValidationError(
        "Turn on two-factor authentication for your own account first, then require it for administrators.",
        { field: "requireAdmin2fa" },
      );
    }
    const settings = await getContainer().settings.update(ctx.actor, {
      requireAdmin2fa: parsedInput.requireAdmin2fa,
      branding: parsedInput.branding,
      allowAnonymousLinks: parsedInput.allowAnonymousLinks,
      allowSignups: parsedInput.allowSignups,
      pixelsEnabled: parsedInput.pixelsEnabled,
      healthMonitorEnabled: parsedInput.healthMonitorEnabled,
      weeklyReportEnabled: parsedInput.weeklyReportEnabled,
      reportSendDay: parsedInput.reportSendDay === "" ? null : parsedInput.reportSendDay,
      reportSendHourUtc: parsedInput.reportSendHourUtc === "" ? null : parsedInput.reportSendHourUtc,
      clickRetentionDays: parsedInput.clickRetentionDays === "" ? null : parsedInput.clickRetentionDays,
      anonLinkTtlHours: parsedInput.anonLinkTtlHours === "" ? null : parsedInput.anonLinkTtlHours,
      blockedDomains:
        parsedInput.blockedDomainsMode === "default" ? null : parsedInput.blockedDomains.split(/[\s,]+/),
    });
    revalidatePath("/admin");
    revalidatePath("/");
    return { settings };
  });

export const previewRetentionAction = adminActionClient
  .metadata({ name: "preview-retention" })
  .inputSchema(z.object({ days: z.coerce.number().int().min(1).max(3650) }))
  .action(async ({ parsedInput, ctx }) => ({
    days: parsedInput.days,
    ...(await getContainer().retention.preview(ctx.actor, parsedInput.days)),
  }));

export const runJobNowAction = adminActionClient
  .metadata({ name: "run-job-now" })
  .inputSchema(
    z.object({ name: z.enum(["retention", "link-health", "weekly-report", "broken-links-digest"]) }),
  )
  .action(async ({ parsedInput }) => {
    const started = await getContainer().jobRunner.runNow(parsedInput.name);
    revalidatePath("/admin");
    return { started };
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
