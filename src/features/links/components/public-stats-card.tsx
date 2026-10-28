"use client";

import { Globe2, Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LinkDto } from "@/server/services/dto";
import { setPublicStatsAction } from "../actions";

/** Opt-in public stats page for one link: turn it on or off, copy the address, or replace it. */
export function PublicStatsCard({ link }: { link: LinkDto }) {
  const router = useRouter();
  const run = useAction(setPublicStatsAction, {
    onSuccess: () => router.refresh(),
    onError: ({ error }) => toast.error(error.serverError ?? "Could not change the stats page"),
  });
  const on = link.statsUrl !== null;

  return (
    <Card data-testid="public-stats-card">
      <CardHeader>
        <CardTitle className="font-display text-xl">Public stats page</CardTitle>
        <CardDescription>
          Share a read-only page with this link&apos;s clicks, countries, referrers and devices. It shows
          totals only, never individual visitors, and search engines are told to skip it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="public-stats-switch" className="flex items-center gap-2">
            <Globe2 className="size-4 text-muted-foreground" aria-hidden />
            Anyone with the address can view it
          </Label>
          <Switch
            id="public-stats-switch"
            checked={on}
            disabled={run.isPending}
            onCheckedChange={(checked) => run.execute({ id: link.id, mode: checked ? "enable" : "disable" })}
          />
        </div>
        {on && link.statsUrl ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                readOnly
                aria-label="Public stats address"
                value={link.statsUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 min-w-0 flex-1 rounded-md border bg-muted/40 px-3 font-mono text-xs"
              />
              <CopyButton value={link.statsUrl} label="Copy stats address" />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={run.isPending}
              onClick={() => run.execute({ id: link.id, mode: "rotate" })}
            >
              {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Generate a new address
            </Button>
            <p className="text-xs text-muted-foreground">
              A new address immediately stops the old one working. Turning the page off does the same.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
