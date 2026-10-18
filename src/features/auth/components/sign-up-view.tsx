"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignUpForm, SocialButtons } from "@/features/auth/components/auth-forms";
import { EmailVerificationCard } from "./email-verification-card";

interface SignUpViewProps {
  providers: ("github" | "google")[];
  requireVerification: boolean;
  footer: ReactNode;
}

export function SignUpView({ providers, requireVerification, footer }: SignUpViewProps) {
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

  if (verifyEmail) {
    return <EmailVerificationCard email={verifyEmail} onBack={() => setVerifyEmail(null)} />;
  }

  return (
    <AuthCard title="Create your account" description="Shorten, track and manage your links." footer={footer}>
      <SocialButtons providers={providers} />
      <SignUpForm
        requireVerification={requireVerification}
        onVerificationRequired={(email) => setVerifyEmail(email)}
      />
      <p className="text-xs text-muted-foreground">
        By creating an account you agree to the{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">
          Terms of use
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy policy
        </Link>
        .
      </p>
    </AuthCard>
  );
}
