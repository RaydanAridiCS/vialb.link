import "server-only";
import { notFound, redirect } from "next/navigation";
import { can } from "@/lib/permissions";
import { requireSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import type { LinkDto } from "@/server/services/dto";

/** Tags the current user already uses, for autocomplete and the dashboard filter. */
export async function loadTagSuggestions(): Promise<string[]> {
  const { actor } = await requireSession();
  return getContainer().links.listTags(actor);
}

/** Pages that create or change links: read-only roles are sent back to the list instead of a form that fails. */
export async function requireLinkWriterPage(): Promise<void> {
  const { actor } = await requireSession();
  if (!can(actor.workspace.role, "link:write")) redirect("/dashboard/links");
}

/** Loads a link the current user may manage, or renders the 404 page. */
export async function loadOwnedLink(id: string): Promise<LinkDto> {
  const { actor } = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  try {
    return await getContainer().links.get(actor, id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound();
    throw error;
  }
}
