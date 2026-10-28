import { apiFolderNameSchema } from "@/features/links/api-schemas";
import { getContainer } from "@/server/container";
import { readJson, withApiKey } from "@/server/http/api";

const view = (folder: { id: string; name: string; createdAt: Date }, linkCount: number) => ({
  id: folder.id,
  name: folder.name,
  linkCount,
  createdAt: folder.createdAt.toISOString(),
});

/** GET /api/v1/folders — the workspace's folders with how many links each holds. */
export const GET = withApiKey(async (_request, { actor }) => {
  const folders = await getContainer().folders.list(actor);
  return Response.json({ data: folders.map((f) => view(f, f.linkCount)) });
});

/** POST /api/v1/folders — create a folder (editor role or above). */
export const POST = withApiKey(async (request, { actor }) => {
  const { name } = apiFolderNameSchema.parse(await readJson(request));
  const folder = await getContainer().folders.create(actor, name);
  return Response.json(view(folder, 0), {
    status: 201,
    headers: { Location: `/api/v1/folders/${folder.id}` },
  });
});
