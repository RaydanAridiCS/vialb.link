"use client";

import { Loader2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { describeHealthReason } from "@/lib/link-health";
import type { LinkDto } from "@/server/services/dto";
import { dismissLinkHealthAction, recheckLinkHealthAction } from "../actions";

/** Destination health of one link on its edit page: last result, reason, and the owner's two actions. */
export function LinkHealthCard({ link }: { link: LinkDto }) {
  const router = useRouter();
  const health = link.health;
  const checkable = link.status === "active" && !link.hasPassword;

  const recheck = useAction(recheckLinkHealthAction, {
    onSuccess: ({ data }) => {
      if (data?.health.needsAttention) toast.warning(describeHealthReason(data.health.reason));
      else if (data?.health.state === "failing")
        toast.warning("The last check failed; it will be retried soon");
      else toast.success("The destination is reachable");
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Could not check this link"),
  });
  const dismiss = useAction(dismissLinkHealthAction, {
    onSuccess: () => {
      toast.success("Warning dismissed");
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Could not dismiss"),
  });

  return (
    <Card data-testid="link-health-card">
      <CardHeader>
        <CardTitle className="font-display text-xl">Destination health</CardTitle>
        <CardDescription>
          The server periodically requests where this link points (including smart-routing targets) and flags
          it after several failures in a row.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {!checkable ? (
            <Badge variant="secondary">Not checked</Badge>
          ) : health?.needsAttention ? (
            <Badge variant="destructive">
              <TriangleAlert aria-hidden /> Needs attention
            </Badge>
          ) : health?.state === "failing" ? (
            <Badge variant="warning">Failing, retrying</Badge>
          ) : health ? (
            <Badge variant="success">
              <ShieldCheck aria-hidden /> Reachable
            </Badge>
          ) : (
            <Badge variant="secondary">Not checked yet</Badge>
          )}
          {health?.dismissed ? <Badge variant="outline">Warning dismissed</Badge> : null}
          {health?.lastCheckedAt ? (
            <span className="text-sm text-muted-foreground">
              Last checked {formatRelative(health.lastCheckedAt)}
            </span>
          ) : null}
        </div>
        {health && health.state !== "ok" ? (
          <p className="text-sm">
            {describeHealthReason(health.reason)}
            {health.statusCode ? ` (HTTP ${health.statusCode})` : ""}
            {health.failingTarget && health.failingTarget !== link.destinationUrl ? (
              <>
                {" "}
                at <span className="font-mono text-xs break-all">{health.failingTarget}</span>
              </>
            ) : null}
            .
          </p>
        ) : null}
        {!checkable ? (
          <p className="text-sm text-muted-foreground">
            Disabled, expired, password-protected and limit-reached links are not checked.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!checkable || recheck.isPending}
            onClick={() => recheck.execute({ id: link.id })}
          >
            {recheck.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Re-check now
          </Button>
          {health?.needsAttention ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={dismiss.isPending}
              onClick={() => dismiss.execute({ id: link.id })}
            >
              Dismiss warning
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
