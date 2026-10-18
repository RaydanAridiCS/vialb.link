import "server-only";
import type { NextRequest } from "next/server";
import { actorFromSession, getSession } from "@/server/auth/session";
import type { Actor } from "@/server/domain/types";
import { UnauthorizedError } from "@/server/errors";
import { errorResponse } from "./error-mapper";

type Handler<P> = (
  request: NextRequest,
  actor: Extract<Actor, { kind: "user" }>,
  params: P,
) => Promise<Response>;

/**
 * Cookie-session route handlers used by the dashboard (GET-only downloads:
 * QR images, CSV/JSON exports). The public REST API uses `withApiKey`.
 */
export function withSession<P>(handler: Handler<P>) {
  return async (request: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const session = await getSession();
      if (!session) throw new UnauthorizedError();
      return await handler(request, actorFromSession(session), await context.params);
    } catch (error) {
      return errorResponse(error, { "Cache-Control": "no-store" });
    }
  };
}
