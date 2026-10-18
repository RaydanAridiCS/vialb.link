import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignInForm, SocialButtons } from "@/features/auth/components/auth-forms";
import { getAuthPageConfig } from "@/features/auth/config";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getSession()) redirect("/dashboard");
  const [config, params] = await Promise.all([getAuthPageConfig(), searchParams]);
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to manage your links."
      footer={
        config.allowSignups ? (
          <span>
            No account?{" "}
            <Link href="/sign-up" className="text-foreground underline underline-offset-4">
              Sign up
            </Link>
          </span>
        ) : undefined
      }
    >
      {params.reset ? (
        <p
          role="status"
          className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
        >
          Password updated. Sign in with your new password.
        </p>
      ) : null}
      <SocialButtons providers={config.providers} />
      <SignInForm showForgot={config.showForgot} />
    </AuthCard>
  );
}
