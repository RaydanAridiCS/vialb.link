import { apiImportRequestSchema, type apiImportResponseSchema } from "@/features/links/api-schemas";
import type { z } from "zod";
import { LIMITS } from "@/lib/constants";
import { env } from "@/lib/env";
import { getContainer } from "@/server/container";
import { ValidationError } from "@/server/errors";
import { withApiKey } from "@/server/http/api";
import { shortUrlFor } from "@/server/services/dto";

/**
 * POST /api/v1/links/import — create up to 100 links in one request. Every row succeeds or fails on its
 * own (the response lists each), and sending a row again whose code already points at the same destination
 * is reported as `skipped`, so retrying a whole request is safe.
 */
export const POST = withApiKey(async (request, { actor }) => {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > LIMITS.apiImportMaxBytes) {
    throw new ValidationError(`The request body can be at most ${LIMITS.apiImportMaxBytes / 1024} KB`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ValidationError("The request body must be JSON");
  }
  const { links: rows } = apiImportRequestSchema.parse(body);
  const service = getContainer().links;

  const results: z.output<typeof apiImportResponseSchema>["results"] = [];
  for (let start = 0; start < rows.length; start += LIMITS.importBatchSize) {
    const chunk = rows.slice(start, start + LIMITS.importBatchSize);
    const done = await service.importLinks(
      actor,
      chunk.map((row, i) => ({
        row: start + i + 1,
        destinationUrl: row.url,
        customCode: row.code || undefined,
        title: row.title ?? null,
        tags: row.tags,
        folder: row.folder ?? null,
      })),
    );
    for (const result of done) {
      const index = result.row - 1;
      if (result.status === "failed") {
        results.push({
          index,
          status: "failed" as const,
          reason: result.reason,
          ...(result.field ? { field: result.field } : {}),
        });
      } else {
        const shortUrl = shortUrlFor(env.SITE_URL, result.code);
        results.push(
          result.status === "created"
            ? { index, status: "created" as const, code: result.code, shortUrl }
            : { index, status: "skipped" as const, code: result.code, shortUrl, reason: result.reason },
        );
      }
    }
  }
  const count = (status: string) => results.filter((r) => r.status === status).length;
  return Response.json({
    results,
    summary: { created: count("created"), skipped: count("skipped"), failed: count("failed") },
  });
});
