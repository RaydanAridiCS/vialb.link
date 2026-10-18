import type { Metadata } from "next";
import { AuthCard } from "@/features/auth/components/auth-card";
import { TwoFactorForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default function TwoFactorPage() {
  return (
    <AuthCard
      title="Two-factor authentication"
      description="Enter the 6-digit code from your authenticator app."
    >
      <TwoFactorForm />
    </AuthCard>
  );
}
