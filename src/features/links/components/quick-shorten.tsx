"use client";

import { ArrowRight, BarChart3, Link2, Loader2, QrCode } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import QRCode from "qrcode";
import { useState } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Turnstile } from "@/components/turnstile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLAIM_TOKENS_STORAGE_KEY } from "@/lib/constants";
import { quickCreateLinkAction } from "../actions";
import { destinationUrlSchema } from "../schemas";
import { downloadDataUrl, QrPreview } from "./qr-preview";

export function storeClaimToken(token: string) {
  try {
    const existing = JSON.parse(localStorage.getItem(CLAIM_TOKENS_STORAGE_KEY) ?? "[]") as unknown;
    const tokens = Array.isArray(existing) ? existing.filter((t): t is string => typeof t === "string") : [];
    localStorage.setItem(CLAIM_TOKENS_STORAGE_KEY, JSON.stringify([...tokens, token].slice(-100)));
  } catch {
    // storage unavailable (private mode): the link still works, it just can't be claimed later
  }
}

export function QuickShorten({
  signedIn,
  anonymousAllowed,
  turnstileSiteKey,
  nonce,
}: {
  signedIn: boolean;
  anonymousAllowed: boolean;
  turnstileSiteKey: string | null;
  nonce?: string;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>();
  const [captchaReset, setCaptchaReset] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const canCreate = signedIn || anonymousAllowed;
  const needsCaptcha = !signedIn && !!turnstileSiteKey;

  const { execute, result, isPending, reset } = useAction(quickCreateLinkAction, {
    onSuccess: ({ data }) => {
      if (data?.claimToken) storeClaimToken(data.claimToken);
      setUrl("");
      setShowQr(false);
    },
    onError: ({ error: e }) => {
      setError(e.serverError ?? "Please enter a valid http(s) URL");
      toast.error(e.serverError ?? "Could not shorten this URL");
    },
    onSettled: () => {
      if (needsCaptcha) setCaptchaReset((n) => n + 1);
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = destinationUrlSchema.safeParse(url);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid URL");
      return;
    }
    if (needsCaptcha && !captchaToken) {
      setError("Please complete the captcha");
      return;
    }
    reset();
    execute({ destinationUrl: parsed.data, captchaToken });
  }

  const created = result.data;

  async function downloadQr() {
    if (!created) return;
    const dataUrl = await QRCode.toDataURL(created.link.shortUrl, { width: 1024, margin: 2 });
    downloadDataUrl(dataUrl, `${created.link.code}-qr.png`);
  }

  return (
    <div className="w-full max-w-2xl space-y-4">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Label htmlFor="quick-url" className="sr-only">
          Paste a long URL
        </Label>
        <div className="flex flex-col gap-2 rounded-2xl border bg-card p-2 shadow-lifted transition-shadow focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-ring/20 sm:flex-row sm:items-center">
          <Link2 className="ml-3 hidden size-5 shrink-0 text-muted-foreground sm:block" aria-hidden />
          <Input
            id="quick-url"
            name="url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="Paste a long URL…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-12 border-0 bg-transparent text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
            aria-invalid={!!error}
            aria-describedby={error ? "quick-url-error" : undefined}
            disabled={!canCreate}
          />
          {canCreate ? (
            <Button type="submit" size="lg" disabled={isPending} className="h-12 rounded-xl px-6">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Shorten
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button size="lg" asChild className="h-12 rounded-xl px-6">
              <Link href="/sign-up">Sign up to shorten</Link>
            </Button>
          )}
        </div>
        {needsCaptcha && canCreate ? (
          <Turnstile
            siteKey={turnstileSiteKey}
            nonce={nonce}
            onToken={setCaptchaToken}
            resetSignal={captchaReset}
          />
        ) : null}
        <p id="quick-url-error" role="alert" className="min-h-5 text-sm text-destructive">
          {error}
        </p>
      </form>

      {created ? (
        <Card
          data-testid="quick-result"
          className="animate-in gap-4 py-5 text-left duration-500 fade-in slide-in-from-bottom-2"
        >
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <a
                  href={created.link.shortUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate font-mono text-lg font-medium text-primary underline-offset-4 hover:underline"
                  data-testid="quick-short-url"
                >
                  {created.link.shortUrl}
                </a>
                <p className="truncate text-sm text-muted-foreground">{created.link.destinationUrl}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <CopyButton value={created.link.shortUrl} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowQr((v) => !v)}
                  aria-expanded={showQr}
                >
                  <QrCode className="size-4" /> QR
                </Button>
                {created.signedIn ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/links/${created.link.id}`}>
                      <BarChart3 className="size-4" /> Analytics
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
            {showQr ? (
              <div className="flex flex-col items-center gap-3">
                <QrPreview value={created.link.shortUrl} />
                <Button variant="secondary" size="sm" onClick={downloadQr}>
                  Download PNG
                </Button>
              </div>
            ) : null}
            {!created.signedIn ? (
              <p className="border-t border-dashed pt-4 text-sm text-muted-foreground">
                {created.link.expiresAt
                  ? `This anonymous link expires on ${new Date(created.link.expiresAt).toLocaleString()}. `
                  : ""}
                <Link href="/sign-up" className="text-foreground underline underline-offset-4">
                  Create an account
                </Link>{" "}
                to keep it and see analytics. It will be added to your dashboard automatically.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
