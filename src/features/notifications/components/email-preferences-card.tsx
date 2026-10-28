"use client";

import { Loader2, Mail } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { sendReportPreviewAction, updateEmailPreferencesAction } from "../actions";

export interface EmailPreferencesCardProps {
  weeklyReport: boolean;
  brokenLinksEmail: boolean;
  /** The instance sends the weekly report. */
  reportsEnabled: boolean;
  /** The instance also runs the health monitor, so the broken-links email exists. */
  brokenLinksEnabled: boolean;
  mailConfigured: boolean;
}

/** Per-person opt-out for the scheduled emails, plus a "send me a preview" button. */
export function EmailPreferencesCard({
  weeklyReport,
  brokenLinksEmail,
  reportsEnabled,
  brokenLinksEnabled,
  mailConfigured,
}: EmailPreferencesCardProps) {
  const [report, setReport] = useState(weeklyReport);
  const [broken, setBroken] = useState(brokenLinksEmail);

  const save = useAction(updateEmailPreferencesAction, {
    onSuccess: () => toast.success("Email preferences saved"),
    onError: ({ error }) => toast.error(error.serverError ?? "Could not save your preferences"),
  });
  const preview = useAction(sendReportPreviewAction, {
    onSuccess: () => toast.success("Preview sent to your address"),
    onError: ({ error }) => toast.error(error.serverError ?? "Could not send the preview"),
  });

  return (
    <Card data-testid="email-preferences">
      <CardHeader>
        <CardTitle className="font-display text-xl">Email</CardTitle>
        <CardDescription>
          Workspace owners and admins can get a summary of the week. Choose what you want to receive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!mailConfigured ? (
          <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            This instance has no email delivery configured, so these emails are not sent.
          </p>
        ) : !reportsEnabled ? (
          <p className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            The administrator has not turned on report emails yet. Your choices are saved for when they do.
          </p>
        ) : null}

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="pref-weekly">Weekly report</Label>
            <p className="text-sm text-muted-foreground">
              Top links, clicks compared with the week before, top referrers and countries.
            </p>
          </div>
          <Switch
            id="pref-weekly"
            checked={report}
            disabled={save.isPending}
            onCheckedChange={(checked) => {
              setReport(checked);
              save.execute({ weeklyReport: checked });
            }}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="pref-broken">Broken links</Label>
            <p className="text-sm text-muted-foreground">
              A weekly list of links whose destination stopped working
              {brokenLinksEnabled ? "." : " (the link health monitor is off on this instance)."}
            </p>
          </div>
          <Switch
            id="pref-broken"
            checked={broken}
            disabled={save.isPending}
            onCheckedChange={(checked) => {
              setBroken(checked);
              save.execute({ brokenLinksEmail: checked });
            }}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!mailConfigured || preview.isPending}
          onClick={() => preview.execute({})}
        >
          {preview.isPending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
          Send me a preview
        </Button>
      </CardContent>
    </Card>
  );
}
