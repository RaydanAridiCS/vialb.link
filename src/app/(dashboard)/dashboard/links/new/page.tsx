import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { LinkForm } from "@/features/links/components/link-form";
import { loadFolders, loadTagSuggestions, requireLinkWriterPage } from "@/features/links/queries";
import { env } from "@/lib/env";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "New link" };

export default async function NewLinkPage() {
  await requireLinkWriterPage();
  const [tagSuggestions, settings, folders] = await Promise.all([
    loadTagSuggestions(),
    getContainer().settings.get(),
    loadFolders(),
  ]);
  return (
    <>
      <PageHeader title="Create a short link" description="Every field except the URL is optional." />
      <LinkForm
        siteUrl={env.SITE_URL}
        pixelsEnabled={settings.pixelsEnabled}
        tagSuggestions={tagSuggestions}
        folders={folders}
      />
    </>
  );
}
