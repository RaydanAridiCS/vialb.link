import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/auth-forms";
import { getAuthPageConfig } from "@/features/auth/config";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  const config = await getAuthPageConfig();
  if (!config.showForgot) notFound();
  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link to choose a new password."
      footer={
        <Link href="/sign-in" className="underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
