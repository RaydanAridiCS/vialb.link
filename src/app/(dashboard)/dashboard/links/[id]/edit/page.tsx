import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { LinkForm } from "@/features/links/components/link-form";
import { LinkHealthCard } from "@/features/links/components/link-health-card";
import { PublicStatsCard } from "@/features/links/components/public-stats-card";
import { loadOwnedLink, loadTagSuggestions, requireLinkWriterPage } from "@/features/links/queries";
import { env } from "@/lib/env";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Edit link" };

export default async function EditLinkPage({ params }: PageProps<"/dashboard/links/[id]/edit">) {
  const { id } = await params;
  await requireLinkWriterPage();
  const [link, tagSuggestions, settings] = await Promise.all([
    loadOwnedLink(id),
    loadTagSuggestions(),
    getContainer().settings.get(),
  ]);
  return (
    <>
      <PageHeader title={`Edit /${link.code}`} description={link.destinationUrl} />
      <LinkForm
        link={link}
        siteUrl={env.SITE_URL}
        pixelsEnabled={settings.pixelsEnabled}
        tagSuggestions={tagSuggestions}
      />
      <div className="mx-auto mt-6 max-w-3xl space-y-6">
        {settings.healthMonitorEnabled ? <LinkHealthCard link={link} /> : null}
        <PublicStatsCard link={link} />
      </div>
    </>
  );
}
