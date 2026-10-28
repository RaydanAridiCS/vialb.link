import { z } from "zod";
import { apiFolderNameSchema } from "@/features/links/api-schemas";
import { getContainer } from "@/server/container";
import { readJson, withApiKey } from "@/server/http/api";

const idSchema = z.uuid();

/** PATCH /api/v1/folders/{id} — rename. */
export const PATCH = withApiKey<{ id: string }>(async (request, { actor }, { id }) => {
  const { name } = apiFolderNameSchema.parse(await readJson(request));
  const { folders } = getContainer();
  const folder = await folders.rename(actor, idSchema.parse(id), name);
  const count = (await folders.list(actor)).find((f) => f.id === folder.id)?.linkCount ?? 0;
  return Response.json({
    id: folder.id,
    name: folder.name,
    linkCount: count,
    createdAt: folder.createdAt.toISOString(),
  });
});

/** DELETE /api/v1/folders/{id} — deletes the folder only; its links end up in no folder. */
export const DELETE = withApiKey<{ id: string }>(async (_request, { actor }, { id }) => {
  await getContainer().folders.delete(actor, idSchema.parse(id));
  return new Response(null, { status: 204 });
});
