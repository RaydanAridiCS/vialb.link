import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CenteredPage } from "@/components/centered-page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UnlockForm } from "@/features/links/components/unlock-form";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Password required", robots: { index: false, follow: false } };

export default async function PasswordPage({ params, searchParams }: PageProps<"/p/[code]">) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const state = await getContainer().redirect.describeProtected(code);
  if (state === "missing") notFound();
  if (state === "unprotected") redirect(`/${encodeURIComponent(code)}`);

  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const v of Array.isArray(value) ? value : [value])
      if (typeof v === "string") forwarded.append(key, v);
  }

  return (
    <CenteredPage>
      <Card>
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-muted">
            <Lock className="size-5" aria-hidden />
          </div>
          <CardTitle>
            <h1 className="text-xl">This link is password protected</h1>
          </CardTitle>
          <CardDescription>Enter the password you were given to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <UnlockForm code={code} query={forwarded.toString()} />
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
