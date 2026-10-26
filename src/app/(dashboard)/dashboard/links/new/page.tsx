import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { LinkForm } from "@/features/links/components/link-form";
import { loadTagSuggestions } from "@/features/links/queries";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "New link" };

export default async function NewLinkPage() {
  const tagSuggestions = await loadTagSuggestions();
  return (
    <>
      <PageHeader title="Create a short link" description="Every field except the URL is optional." />
      <LinkForm siteUrl={env.SITE_URL} tagSuggestions={tagSuggestions} />
    </>
  );
}
