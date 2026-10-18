import { z } from "zod";
import { apiUpdateLinkSchema, toUpdateCommand } from "@/features/links/api-schemas";
import { getContainer } from "@/server/container";
import { readJson, withApiKey } from "@/server/http/api";

const idSchema = z.uuid();

export const GET = withApiKey<{ id: string }>(async (_request, { actor }, { id }) => {
  return Response.json(await getContainer().links.get(actor, idSchema.parse(id)));
});

export const PATCH = withApiKey<{ id: string }>(async (request, { actor }, { id }) => {
  const input = apiUpdateLinkSchema.parse(await readJson(request));
  return Response.json(await getContainer().links.update(actor, idSchema.parse(id), toUpdateCommand(input)));
});

export const DELETE = withApiKey<{ id: string }>(async (_request, { actor }, { id }) => {
  await getContainer().links.delete(actor, [idSchema.parse(id)]);
  return new Response(null, { status: 204 });
});
