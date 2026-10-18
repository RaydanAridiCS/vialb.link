import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignUpView } from "@/features/auth/components/sign-up-view";
import { getAuthPageConfig } from "@/features/auth/config";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/dashboard");
  const config = await getAuthPageConfig();
  const footer = (
    <span>
      Already have an account?{" "}
      <Link href="/sign-in" className="text-foreground underline underline-offset-4">
        Sign in
      </Link>
    </span>
  );
  if (!config.allowSignups) {
    return (
      <AuthCard
        title="Sign-ups are closed"
        description="This instance is not accepting new accounts."
        footer={footer}
      >
        <p className="text-sm text-muted-foreground">
          Ask the administrator of this instance for an invitation.
        </p>
      </AuthCard>
    );
  }
  return (
    <SignUpView
      providers={config.providers}
      requireVerification={config.requireVerification}
      footer={footer}
    />
  );
}
