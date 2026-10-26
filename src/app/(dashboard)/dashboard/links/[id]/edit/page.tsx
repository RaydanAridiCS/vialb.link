import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { LinkForm } from "@/features/links/components/link-form";
import { loadOwnedLink, loadTagSuggestions } from "@/features/links/queries";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Edit link" };

export default async function EditLinkPage({ params }: PageProps<"/dashboard/links/[id]/edit">) {
  const { id } = await params;
  const [link, tagSuggestions] = await Promise.all([loadOwnedLink(id), loadTagSuggestions()]);
  return (
    <>
      <PageHeader title={`Edit /${link.code}`} description={link.destinationUrl} />
      <LinkForm link={link} siteUrl={env.SITE_URL} tagSuggestions={tagSuggestions} />
    </>
  );
}
