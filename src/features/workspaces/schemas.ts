import { z } from "zod";
import { LIMITS } from "@/lib/constants";
import { WORKSPACE_ROLES } from "@/lib/permissions";

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(LIMITS.workspaceNameMax, `At most ${LIMITS.workspaceNameMax} characters`);

export const createWorkspaceSchema = z.object({ name: workspaceNameSchema });
export const workspaceIdSchema = z.object({ workspaceId: z.uuid() });
export const renameWorkspaceSchema = workspaceIdSchema.extend({ name: workspaceNameSchema });

export const inviteSchema = workspaceIdSchema.extend({
  email: z
    .string()
    .trim()
    .min(3, "Enter an email address")
    .max(254)
    .pipe(z.email("Enter a valid email address")),
  role: z.enum(WORKSPACE_ROLES),
});

export const memberSchema = workspaceIdSchema.extend({ userId: z.string().min(1).max(200) });
export const changeRoleSchema = memberSchema.extend({ role: z.enum(WORKSPACE_ROLES) });
export const revokeInviteSchema = workspaceIdSchema.extend({ inviteId: z.uuid() });
export const acceptInviteSchema = z.object({ token: z.string().min(16).max(128) });
