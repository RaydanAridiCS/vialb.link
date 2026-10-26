/**
 * Workspace roles and what each may do. Pure, so the services that enforce it and the screens that
 * hide buttons for it read the same table. The server is the only place a rule is enforced: hiding a
 * button is a courtesy.
 */

export const WORKSPACE_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export type Permission =
  "link:read" | "link:write" | "members:manage" | "workspace:update" | "workspace:delete";

const GRANTS: Record<WorkspaceRole, readonly Permission[]> = {
  viewer: ["link:read"],
  editor: ["link:read", "link:write"],
  admin: ["link:read", "link:write", "members:manage", "workspace:update"],
  owner: ["link:read", "link:write", "members:manage", "workspace:update", "workspace:delete"],
};

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export function can(role: WorkspaceRole, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

/** Roles a member holding `role` may hand out when inviting or changing someone's role. */
export function assignableRoles(role: WorkspaceRole): readonly WorkspaceRole[] {
  if (role === "owner") return WORKSPACE_ROLES;
  if (role === "admin") return ["editor", "viewer"];
  return [];
}

/**
 * Whether `actor` may change or remove a member who currently holds `target`. Owners can manage anyone;
 * admins only editors and viewers, so an admin can never lock out an owner or another admin.
 */
export function canManageMember(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  return can(actor, "members:manage") && assignableRoles(actor).includes(target);
}

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const WORKSPACE_ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: "Everything, including deleting the workspace and making other owners.",
  admin: "Manage links, members, invitations and the workspace name.",
  editor: "Create, edit and delete links.",
  viewer: "See links and their analytics, but change nothing.",
};
