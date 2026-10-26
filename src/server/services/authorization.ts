import { can, type Permission } from "@/lib/permissions";
import type { Actor, Link } from "@/server/domain/types";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

export type UserActor = Extract<Actor, { kind: "user" }>;

export function requireUser(actor: Actor): UserActor {
  if (actor.kind !== "user") throw new UnauthorizedError();
  return actor;
}

export function requireAdmin(actor: Actor): UserActor {
  const user = requireUser(actor);
  if (user.role !== "admin") throw new ForbiddenError("Administrator access required");
  return user;
}

export function isAdmin(actor: Actor): boolean {
  return actor.kind === "system" || (actor.kind === "user" && actor.role === "admin");
}

/**
 * Who may touch a link: instance admins; members of the link's workspace whose role allows it (the
 * workspace they are acting in right now, so a link elsewhere is simply out of reach); and, for the hidden
 * links behind bio-page buttons, the person who made them, whichever workspace they are showing.
 * Anonymous links nobody has claimed can only be managed by admins.
 */
export function assertCanManageLink(actor: Actor, link: Link, permission: Permission = "link:write"): void {
  if (actor.kind === "system") return;
  const user = requireUser(actor);
  if (user.role === "admin") return;
  if (link.kind === "bio_button") {
    if (link.userId !== null && link.userId === user.userId) return;
  } else if (link.workspaceId !== null && link.workspaceId === user.workspace.id) {
    if (can(user.workspace.role, permission)) return;
    throw new ForbiddenError("Your role in this workspace doesn't allow that");
  }
  throw new ForbiddenError("You do not have access to this link");
}

/** Throws unless the actor may create or change links in the workspace they are acting in. */
export function requireLinkWriter(actor: Actor): UserActor {
  const user = requireUser(actor);
  if (user.role !== "admin" && !can(user.workspace.role, "link:write")) {
    throw new ForbiddenError("Your role in this workspace doesn't allow that");
  }
  return user;
}
