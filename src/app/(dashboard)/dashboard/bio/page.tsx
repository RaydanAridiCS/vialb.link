import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { BioEditor } from "@/features/bio/components/bio-editor";
import { normalizeHandle } from "@/lib/bio";
import { env } from "@/lib/env";
import { requireSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Bio page" };

/** A starting point for the handle field: the name or email prefix, cleaned up. */
function suggestHandle(name: string, email: string): string {
  const source = name.includes(" ") ? name : (email.split("@")[0] ?? name);
  return normalizeHandle(source.replace(/[^A-Za-z0-9_]+/g, "_"))
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

export default async function BioPage() {
  const { session, actor } = await requireSession();
  const initial = await getContainer().bio.getEditor(actor);
  return (
    <>
      <PageHeader
        title="Bio page"
        description="One link for your profiles, with your own buttons. Every button click is counted."
      />
      <BioEditor
        initial={initial}
        siteUrl={env.SITE_URL}
        suggestion={{
          handle: suggestHandle(session.user.name, session.user.email),
          displayName: session.user.name,
        }}
      />
    </>
  );
}
