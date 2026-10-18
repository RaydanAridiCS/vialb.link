"use client";

import { CheckCircle2, ChevronRight, Mail, MailCheck, RefreshCw, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { APP_NAME } from "@/lib/constants";

interface EmailVerificationCardProps {
  email: string;
  onBack?: () => void;
  callbackURL?: string;
}

export function EmailVerificationCard({
  email,
  onBack,
  callbackURL = "/verify-email",
}: EmailVerificationCardProps) {
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  async function handleResend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL,
      });

      if (error) {
        toast.error(error.message ?? "Could not resend verification email. Please try again.");
      } else {
        toast.success("Verification email resent! Check your inbox.");
        setCooldown(60);
      }
    } catch {
      toast.error("Failed to send verification email. Please check your connection.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="animate-in space-y-6 duration-300 fade-in-50">
      {/* Icon & Hero Badge */}
      <div className="flex flex-col items-center space-y-3 text-center">
        <div className="relative flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm ring-1 ring-primary/25">
          <MailCheck className="size-8" />
          <span className="absolute -top-1 -right-1 flex size-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-primary" />
          </span>
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Check your inbox</h2>
          <p className="text-sm text-muted-foreground">We sent an activation link to:</p>
        </div>
        <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/80 px-3 py-1.5 font-mono text-xs font-medium break-all text-foreground">
          <Mail className="size-3.5 shrink-0 text-muted-foreground" />
          <span>{email}</span>
        </div>
      </div>

      {/* Helpful Steps */}
      <div className="space-y-3 rounded-xl border border-border/80 bg-card/60 p-4 text-sm">
        <p className="text-sm font-medium text-foreground">Next steps</p>
        <ul className="space-y-2.5 text-xs text-foreground/85">
          <li className="flex items-start gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
              1
            </span>
            <span>
              Open the verification email sent from <strong>{APP_NAME}</strong>.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
              2
            </span>
            <span>
              Click <strong>Verify email address</strong> to activate your account.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
              3
            </span>
            <span>Then continue to your dashboard.</span>
          </li>
        </ul>
      </div>

      {/* Resend Action */}
      <div className="space-y-3 pt-1">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full text-sm font-medium transition-all"
          disabled={resending || cooldown > 0}
          onClick={handleResend}
        >
          {resending ? (
            <>
              <RefreshCw className="mr-2 size-4 animate-spin" />
              Sending verification email...
            </>
          ) : cooldown > 0 ? (
            <>
              <RotateCcw className="mr-2 size-4 opacity-50" />
              Resend email in {cooldown}s
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 size-4" />
              Resend verification email
            </>
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Can&apos;t find it? Check your spam folder or wait up to 1 minute.
        </p>
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            &larr; Use another email
          </button>
        ) : (
          <Link
            href="/sign-up"
            className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            &larr; Back to sign up
          </Link>
        )}
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          <span>Sign in</span>
          <ChevronRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}

export function VerificationSuccessCard({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  return (
    <div className="animate-in space-y-6 text-center duration-300 fade-in-50">
      <div className="flex flex-col items-center space-y-3">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 shadow-sm ring-1 ring-emerald-500/30 dark:text-emerald-400">
          <CheckCircle2 className="size-9" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">Email verified!</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            Your email address has been verified successfully. Your {APP_NAME} account is now active.
          </p>
        </div>
      </div>

      <div className="pt-2">
        <Button asChild size="lg" className="w-full">
          <Link href={redirectTo}>
            Go to dashboard
            <ChevronRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
