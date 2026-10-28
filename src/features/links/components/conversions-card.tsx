"use client";

import { Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LinkDto } from "@/server/services/dto";
import { setConversionsAction } from "../actions";

/** Opt-in conversion tracking for one link: the switch, a plain statement of what it does, and the two ways to report. */
export function ConversionsCard({ link, siteUrl }: { link: LinkDto; siteUrl: string }) {
  const router = useRouter();
  const run = useAction(setConversionsAction, {
    onSuccess: () => router.refresh(),
    onError: ({ error }) => toast.error(error.serverError ?? "Could not change conversion tracking"),
  });
  const on = link.conversionsEnabled;
  const snippet = `<script src="${siteUrl}/api/convert/snippet.js"></script>`;
  const call = `vialb.convert({ value: 49.9, currency: "USD" });`;
  const postback = `${siteUrl}/api/convert?cid={vclid}&value={amount}&currency=USD`;

  return (
    <Card data-testid="conversions-card">
      <CardHeader>
        <CardTitle className="font-display text-xl">Conversion tracking</CardTitle>
        <CardDescription>
          Count how many visits turn into a sign-up, purchase or other goal on the destination site.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          When on, every visitor is sent to your destination with a random{" "}
          <code className="font-mono">vclid</code> parameter added to the URL. It is not derived from the
          visitor and holds no personal data, but your destination and anything that logs its URLs will see
          it. No cookies are set by Vialb.
        </p>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="conversions-switch" className="flex items-center gap-2">
            <Target className="size-4 text-muted-foreground" aria-hidden />
            Track conversions for this link
          </Label>
          <Switch
            id="conversions-switch"
            checked={on}
            disabled={run.isPending}
            onCheckedChange={(checked) => run.execute({ id: link.id, enabled: checked })}
          />
        </div>
        {on ? (
          <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <p className="font-medium">From a web page on the destination</p>
              <p className="text-muted-foreground">Add this once, then call it when the goal happens.</p>
              <Snippet value={snippet} label="Copy script tag" />
              <Snippet value={call} label="Copy call" />
            </div>
            <div className="space-y-1.5">
              <p className="font-medium">From the destination&apos;s server (postback)</p>
              <p className="text-muted-foreground">
                Store the <code className="font-mono">vclid</code> you received and call this when the goal
                happens. Amounts have at most two decimals; <code className="font-mono">value</code> needs a{" "}
                <code className="font-mono">currency</code>.
              </p>
              <Snippet value={postback} label="Copy postback URL" />
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone who has a click&apos;s id can report a conversion for it, once. That is fine for
              measuring campaigns; do not use these numbers to reconcile payments.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Snippet({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        aria-label={label}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-md border bg-muted/40 px-3 font-mono text-xs"
      />
      <CopyButton value={value} label={label} showLabel={false} size="icon" />
    </div>
  );
}
