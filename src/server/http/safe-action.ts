import "server-only";
import { createSafeActionClient } from "next-safe-action";
import { z } from "zod";
import { getSession, actorFromSession } from "@/server/auth/session";
import type { Actor } from "@/server/domain/types";
import { getContainer } from "@/server/container";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import { actionErrorMessage } from "./error-mapper";
import { getRequestIp } from "./request-context";

/**
 * Base client: domain errors become user-facing messages, anything else is
 * logged and replaced with a generic message. Server Actions already enforce
 * same-origin requests (CSRF protection).
 */
export const actionClient = createSafeActionClient({
  handleServerError: (error) => actionErrorMessage(error),
  defineMetadataSchema: () => z.object({ name: z.string() }),
});

/** Actions open to visitors (e.g. anonymous quick-shorten). Actor may be anonymous. */
export const publicActionClient = actionClient.use(async ({ next }) => {
  const session = await getSession();
  const ip = await getRequestIp();
  const actor: Actor = session ? await actorFromSession(session) : { kind: "anonymous", ip };
  return next({ ctx: { actor, ip } });
});

/** Requires a signed-in user. */
export const authActionClient = actionClient.use(async ({ next }) => {
  const session = await getSession();
  if (!session) throw new UnauthorizedError("Please sign in again");
  return next({ ctx: { session, actor: await actorFromSession(session), ip: await getRequestIp() } });
});

/** Requires the admin role. */
export const adminActionClient = authActionClient.use(async ({ next, ctx }) => {
  if (ctx.actor.role !== "admin") throw new ForbiddenError("Administrator access required");
  if (await getContainer().adminGate.mustEnroll(ctx.session.user)) {
    throw new ForbiddenError(
      "This instance requires two-factor authentication for administrators. Turn it on in your settings first.",
    );
  }
  return next();
});
