"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { LIMITS } from "@/lib/constants";
import { getContainer } from "@/server/container";
import { GoneError } from "@/server/errors";
import { publicActionClient } from "@/server/http/safe-action";

const unlockSchema = z.object({
  code: z.string().min(1).max(100),
  password: z.string().min(1, "Enter the password").max(LIMITS.passwordMax),
  query: z.string().max(4000).optional(),
});

/** Verifies a link password, consumes one access atomically, records the click and redirects. */
export const unlockLinkAction = publicActionClient
  .metadata({ name: "unlock-link" })
  .inputSchema(unlockSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { redirect: redirects, analytics } = getContainer();
    const searchParams = new URLSearchParams(parsedInput.query ?? "");
    let destination: string;
    try {
      const result = await redirects.unlock({
        code: parsedInput.code,
        password: parsedInput.password,
        ip: ctx.ip,
        searchParams,
      });
      destination = result.destination;
      const requestHeaders = new Headers(await headers());
      const linkId = result.linkId;
      after(() => analytics.recordClick({ linkId, ip: ctx.ip, headers: requestHeaders, searchParams }));
    } catch (error) {
      if (error instanceof GoneError) {
        redirect(`/gone/${encodeURIComponent(parsedInput.code)}?reason=${error.reason}`);
      }
      throw error;
    }
    redirect(destination);
  });
