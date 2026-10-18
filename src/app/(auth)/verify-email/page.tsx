import type { Metadata } from "next";
import { VerifyEmailView } from "@/features/auth/components/verify-email-view";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Verify your email" };

/**
 * Landing page for emailed verification links. Better Auth verifies the token,
 * signs the user in and redirects here, or appends ?error=<code> on failure.
 * "Verified" comes from the session, never from the query string.
 */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const error = typeof params.error === "string" ? params.error : null;
  const verified = !error && session?.user.emailVerified === true;
  const email = typeof params.email === "string" ? params.email : null;

  return <VerifyEmailView initialError={error} initialVerified={verified} initialEmail={email} />;
}
