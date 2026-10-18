import { getContainer } from "@/server/container";

/**
 * Liveness + readiness. `?live` skips the database check (useful for
 * container liveness probes); the default also verifies Postgres.
 */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (new URL(request.url).searchParams.has("live")) {
    return Response.json({ status: "ok" }, { headers });
  }
  const started = Date.now();
  try {
    await getContainer().repos.health.ping();
    return Response.json({ status: "ok", database: "ok", latencyMs: Date.now() - started }, { headers });
  } catch {
    return Response.json({ status: "error", database: "unreachable" }, { status: 503, headers });
  }
}
