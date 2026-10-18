import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Actor, Role } from "@/server/domain/types";
import { auth, type Session } from "./auth";

/** Current session, de-duplicated per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});

export function actorFromSession(session: Session): Extract<Actor, { kind: "user" }> {
  const role: Role = session.user.role === "admin" ? "admin" : "user";
  return { kind: "user", userId: session.user.id, role };
}

/** For pages/layouts: redirects to sign-in when there is no session. */
export async function requireSession(): Promise<{
  session: Session;
  actor: Extract<Actor, { kind: "user" }>;
}> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return { session, actor: actorFromSession(session) };
}

export async function requireAdminSession() {
  const result = await requireSession();
  if (result.actor.role !== "admin") redirect("/dashboard");
  return result;
}
