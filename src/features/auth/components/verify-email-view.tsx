"use client";

import { AlertCircle, ChevronRight, Loader2, Mail, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { EmailVerificationCard, VerificationSuccessCard } from "./email-verification-card";

interface VerifyEmailViewProps {
  initialError?: string | null;
  initialVerified?: boolean;
  initialEmail?: string | null;
}

export function VerifyEmailView({ initialError, initialVerified, initialEmail }: VerifyEmailViewProps) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [sentEmail, setSentEmail] = useState<string | null>(initialEmail ?? null);
  const [loading, setLoading] = useState(false);
  // Better Auth redirects failed verifications here with ?error=<code>.
  const [errorCode, setErrorCode] = useState<string | null>(initialError ?? null);
  const expired = errorCode === "TOKEN_EXPIRED";

  if (initialVerified) {
    return <VerificationSuccessCard redirectTo="/dashboard" />;
  }

  if (sentEmail && !errorCode) {
    return <EmailVerificationCard email={sentEmail} onBack={() => setSentEmail(null)} />;
  }

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email address");
      return;
    }
    setLoading(true);
    setErrorCode(null);
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: email.trim(),
        callbackURL: "/verify-email",
      });
      if (error) {
        toast.error(error.message ?? "Could not send verification email");
      } else {
        toast.success("Verification link sent! Check your inbox.");
        setSentEmail(email.trim());
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-in space-y-6 duration-300 fade-in-50">
      <div className="flex flex-col items-center space-y-3 text-center">
        <div
          className={`flex size-14 items-center justify-center rounded-2xl shadow-sm ring-1 ${
            errorCode
              ? "bg-destructive/10 text-destructive ring-destructive/25"
              : "bg-primary/10 text-primary ring-primary/25"
          }`}
        >
          {errorCode ? <AlertCircle className="size-7" /> : <Mail className="size-7" />}
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {expired
              ? "Verification link expired"
              : errorCode
                ? "Verification link invalid"
                : "Verify your email"}
          </h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            {expired
              ? "Links are valid for 1 hour. Enter your email below to get a new one."
              : errorCode
                ? "This link is invalid or was already used. Enter your email below to get a new one."
                : "Enter your account email below to receive an activation link."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSendLink} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="verify-email-input">Account email</Label>
          <Input
            id="verify-email-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Sending link...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 size-4" />
              Send verification link
            </>
          )}
        </Button>
      </form>

      <div className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
        <Link
          href="/sign-up"
          className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          &larr; Create new account
        </Link>
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
