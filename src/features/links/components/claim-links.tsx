"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { CLAIM_TOKENS_STORAGE_KEY } from "@/lib/constants";
import { claimLinksAction } from "../actions";

/**
 * After sign-up/sign-in, moves links created anonymously in this browser
 * into the account (tokens were kept in localStorage at creation time).
 */
export function ClaimLinks() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let tokens: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(CLAIM_TOKENS_STORAGE_KEY) ?? "[]") as unknown;
      tokens = Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
    } catch {
      return;
    }
    if (tokens.length === 0) return;
    void claimLinksAction({ tokens }).then((result) => {
      if (result?.serverError) return;
      try {
        localStorage.removeItem(CLAIM_TOKENS_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      const claimed = result?.data?.claimed ?? 0;
      if (claimed > 0) {
        toast.success(`Added ${claimed} link${claimed === 1 ? "" : "s"} you created before signing in`);
        router.refresh();
      }
    });
  }, [router]);

  return null;
}
