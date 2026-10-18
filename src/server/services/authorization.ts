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

/** Owner or admin may manage a link. Anonymous links can only be managed by admins. */
export function assertCanManageLink(actor: Actor, link: Link): void {
  if (actor.kind === "system") return;
  const user = requireUser(actor);
  if (user.role === "admin") return;
  if (link.userId === null || link.userId !== user.userId) {
    throw new ForbiddenError("You do not have access to this link");
  }
}
