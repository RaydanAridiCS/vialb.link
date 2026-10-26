"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PENDING_INVITE_EVENT, PENDING_INVITE_STORAGE_KEY } from "@/lib/constants";
import { WORKSPACE_ROLE_DESCRIPTIONS, WORKSPACE_ROLE_LABELS, type WorkspaceRole } from "@/lib/permissions";
import { acceptInviteAction } from "../actions";

/** Signed-in visitor looking at an invitation addressed to them. */
export function AcceptInvite({
  token,
  workspaceName,
  role,
}: {
  token: string;
  workspaceName: string;
  role: WorkspaceRole;
}) {
  const router = useRouter();
  const accept = useAction(acceptInviteAction, {
    onSuccess: () => {
      try {
        localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
        window.dispatchEvent(new Event(PENDING_INVITE_EVENT));
      } catch {
        /* ignore */
      }
      toast.success(`You joined ${workspaceName}`);
      router.push("/dashboard");
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Could not accept the invitation"),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-[2rem] leading-tight">Join {workspaceName}</h1>
        <p className="text-muted-foreground">
          You were invited as <strong>{WORKSPACE_ROLE_LABELS[role]}</strong>.{" "}
          {WORKSPACE_ROLE_DESCRIPTIONS[role]}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => accept.execute({ token })}
          disabled={accept.isPending}
          data-testid="accept-invite"
        >
          {accept.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Accept invitation
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Not now</Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * Signed-out visitor: remember the invitation in this browser, so after signing in or up the dashboard can
 * offer it again (the sign-in screens have no "come back to" step of their own).
 */
export function RememberInvite({ token }: { token: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(PENDING_INVITE_STORAGE_KEY, token);
    } catch {
      /* private mode: the person can open the link again */
    }
  }, [token]);
  return null;
}
