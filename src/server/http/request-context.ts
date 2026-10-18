import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";
import { getClientIp } from "@/server/lib/request";

export function clientIpFrom(requestHeaders: Headers): string | null {
  return getClientIp(requestHeaders, { trustProxy: env.TRUST_PROXY, trustedHops: env.TRUSTED_PROXY_HOPS });
}

/** Client IP for the current Server Action / Server Component request. */
export async function getRequestIp(): Promise<string | null> {
  return clientIpFrom(await headers());
}
