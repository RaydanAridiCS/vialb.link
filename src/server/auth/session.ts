import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/constants";
import { getContainer } from "@/server/container";
import type { Actor, Role, WorkspaceAccess } from "@/server/domain/types";
import { auth, type Session } from "./auth";

/** Current session, de-duplicated per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
});

/**
 * The workspace to act in: the one named by the cookie if the person still belongs to it, else their own.
 * Looked up on every request, so removing someone from a workspace takes effect immediately.
 */
const resolveWorkspace = cache(async (userId: string, preferred: string | null): Promise<WorkspaceAccess> => {
  return getContainer().workspaces.resolveAccess(userId, preferred);
});

export async function actorFromSession(session: Session): Promise<Extract<Actor, { kind: "user" }>> {
  const role: Role = session.user.role === "admin" ? "admin" : "user";
  const preferred = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;
  const workspace = await resolveWorkspace(session.user.id, preferred);
  return { kind: "user", userId: session.user.id, role, workspace };
}

/** For pages/layouts: redirects to sign-in when there is no session. */
export async function requireSession(): Promise<{
  session: Session;
  actor: Extract<Actor, { kind: "user" }>;
}> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return { session, actor: await actorFromSession(session) };
}

export async function requireAdminSession() {
  const result = await requireSession();
  if (result.actor.role !== "admin") redirect("/dashboard");
  return result;
}
