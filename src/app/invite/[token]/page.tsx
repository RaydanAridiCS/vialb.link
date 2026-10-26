import type { Metadata } from "next";
import Link from "next/link";
import { CenteredPage } from "@/components/centered-page";
import { Button } from "@/components/ui/button";
import { AcceptInvite, RememberInvite } from "@/features/workspaces/components/invite-view";
import { actorFromSession, getSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { DomainError } from "@/server/errors";
import type { InvitePreview } from "@/server/services/workspace.service";

export const metadata: Metadata = {
  title: "Team invitation",
  robots: { index: false, follow: false },
  // The token is in the address; do not pass it on to anything the page links to.
  referrer: "no-referrer",
};

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-[2rem] leading-tight">{title}</h1>
      <div className="space-y-4 text-muted-foreground">{children}</div>
    </div>
  );
}

async function loadPreview(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  token: string,
): Promise<{ preview: InvitePreview } | { problem: string }> {
  try {
    const actor = await actorFromSession(session);
    return { preview: await getContainer().workspaces.previewInvite(actor, token) };
  } catch (error) {
    if (error instanceof DomainError) return { problem: error.message };
    throw error;
  }
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const session = await getSession();

  if (!session) {
    return (
      <CenteredPage>
        <RememberInvite token={token} />
        <Message title="You've been invited to a team">
          <p>
            Sign in, or create an account, with the email address the invitation was sent to. We&apos;ll offer
            the invitation again right after.
          </p>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/sign-up">Create account</Link>
            </Button>
          </div>
        </Message>
      </CenteredPage>
    );
  }

  const result = await loadPreview(session, token);
  if ("problem" in result) {
    return (
      <CenteredPage>
        <Message title="This invitation can't be used">
          <p>{result.problem}</p>
          <Button variant="outline" asChild>
            <Link href="/dashboard">Go to your dashboard</Link>
          </Button>
        </Message>
      </CenteredPage>
    );
  }
  return (
    <CenteredPage>
      <AcceptInvite token={token} workspaceName={result.preview.workspaceName} role={result.preview.role} />
    </CenteredPage>
  );
}
