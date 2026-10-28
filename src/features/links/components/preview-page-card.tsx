"use client";

import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LinkDto } from "@/server/services/dto";
import { setPreviewPageAction } from "../actions";

/** Optional "you are about to leave" page for one link: the visitor sees the destination and chooses to continue. */
export function PreviewPageCard({ link, pixelsEnabled }: { link: LinkDto; pixelsEnabled: boolean }) {
  const router = useRouter();
  const run = useAction(setPreviewPageAction, {
    onSuccess: () => router.refresh(),
    onError: ({ error }) => toast.error(error.serverError ?? "Could not change the preview page"),
  });
  const hasPixels = pixelsEnabled && link.pixels !== null;
  return (
    <Card data-testid="preview-page-card">
      <CardHeader>
        <CardTitle className="font-display text-xl">Preview page</CardTitle>
        <CardDescription>
          Show visitors where the link goes, with a Continue button, instead of redirecting at once. Useful
          for links shared in public places.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="preview-page-switch" className="flex items-center gap-2">
            <Eye className="size-4 text-muted-foreground" aria-hidden />
            Show a preview before redirecting
          </Label>
          <Switch
            id="preview-page-switch"
            checked={link.previewInterstitial}
            disabled={run.isPending}
            onCheckedChange={(checked) => run.execute({ id: link.id, enabled: checked })}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          A visit is counted when the preview is shown, even if the visitor does not continue. Retargeting
          pixels cannot be used together with it
          {hasPixels ? " (remove this link's pixels first)" : ""}. Visitors who unlock a password-protected
          link go straight to the destination.
        </p>
      </CardContent>
    </Card>
  );
}
