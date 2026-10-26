"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/constants";
import { env } from "@/lib/env";
import { getContainer } from "@/server/container";
import { ForbiddenError } from "@/server/errors";
import { authActionClient } from "@/server/http/safe-action";
import {
  acceptInviteSchema,
  changeRoleSchema,
  createWorkspaceSchema,
  inviteSchema,
  memberSchema,
  renameWorkspaceSchema,
  revokeInviteSchema,
  workspaceIdSchema,
} from "./schemas";

async function rememberWorkspace(workspaceId: string) {
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.SITE_URL.startsWith("https://"),
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}

async function forgetWorkspace() {
  (await cookies()).delete(ACTIVE_WORKSPACE_COOKIE);
}

function refresh() {
  revalidatePath("/dashboard", "layout");
}

/** Shows another workspace. Only ones the person belongs to. */
export const switchWorkspaceAction = authActionClient
  .metadata({ name: "switch-workspace" })
  .inputSchema(workspaceIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const access = await getContainer().workspaces.resolveAccess(ctx.actor.userId, parsedInput.workspaceId);
    if (access.id !== parsedInput.workspaceId) {
      throw new ForbiddenError("You are not a member of that workspace");
    }
    await rememberWorkspace(access.id);
    refresh();
    return { workspaceId: access.id };
  });

export const createWorkspaceAction = authActionClient
  .metadata({ name: "create-workspace" })
  .inputSchema(createWorkspaceSchema)
  .action(async ({ parsedInput, ctx }) => {
    const workspace = await getContainer().workspaces.create(ctx.actor, parsedInput.name);
    await rememberWorkspace(workspace.id);
    refresh();
    return { workspaceId: workspace.id };
  });

export const renameWorkspaceAction = authActionClient
  .metadata({ name: "rename-workspace" })
  .inputSchema(renameWorkspaceSchema)
  .action(async ({ parsedInput, ctx }) => {
    await getContainer().workspaces.rename(ctx.actor, parsedInput.workspaceId, parsedInput.name);
    refresh();
    return { ok: true };
  });

export const deleteWorkspaceAction = authActionClient
  .metadata({ name: "delete-workspace" })
  .inputSchema(workspaceIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await getContainer().workspaces.delete(ctx.actor, parsedInput.workspaceId);
    await forgetWorkspace();
    refresh();
    return { ok: true };
  });

export const leaveWorkspaceAction = authActionClient
  .metadata({ name: "leave-workspace" })
  .inputSchema(workspaceIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await getContainer().workspaces.leave(ctx.actor, parsedInput.workspaceId);
    await forgetWorkspace();
    refresh();
    return { ok: true };
  });

export const inviteMemberAction = authActionClient
  .metadata({ name: "invite-member" })
  .inputSchema(inviteSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { url, emailSent, invite } = await getContainer().workspaces.invite(
      ctx.actor,
      parsedInput.workspaceId,
      parsedInput.email,
      parsedInput.role,
    );
    refresh();
    return { url, emailSent, email: invite.email };
  });

export const revokeInviteAction = authActionClient
  .metadata({ name: "revoke-invite" })
  .inputSchema(revokeInviteSchema)
  .action(async ({ parsedInput, ctx }) => {
    await getContainer().workspaces.revokeInvite(ctx.actor, parsedInput.workspaceId, parsedInput.inviteId);
    refresh();
    return { ok: true };
  });

export const changeRoleAction = authActionClient
  .metadata({ name: "change-member-role" })
  .inputSchema(changeRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    await getContainer().workspaces.changeRole(
      ctx.actor,
      parsedInput.workspaceId,
      parsedInput.userId,
      parsedInput.role,
    );
    refresh();
    return { ok: true };
  });

export const removeMemberAction = authActionClient
  .metadata({ name: "remove-member" })
  .inputSchema(memberSchema)
  .action(async ({ parsedInput, ctx }) => {
    await getContainer().workspaces.removeMember(ctx.actor, parsedInput.workspaceId, parsedInput.userId);
    if (parsedInput.userId === ctx.actor.userId) await forgetWorkspace();
    refresh();
    return { ok: true };
  });

/** Accepts an invitation and starts showing that workspace. */
export const acceptInviteAction = authActionClient
  .metadata({ name: "accept-invite" })
  .inputSchema(acceptInviteSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { workspaceId } = await getContainer().workspaces.acceptInvite(ctx.actor, parsedInput.token);
    await rememberWorkspace(workspaceId);
    refresh();
    return { workspaceId };
  });
