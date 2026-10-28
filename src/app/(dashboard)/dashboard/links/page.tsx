import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell";
import { ImportLinksSheet } from "@/features/links/components/import-links-sheet";
import { LinksTable } from "@/features/links/components/links-table";
import { linkListParamsSchema } from "@/features/links/schemas";
import { can } from "@/lib/permissions";
import { requireSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Links" };

export default async function LinksPage({ searchParams }: PageProps<"/dashboard/links">) {
  const { actor } = await requireSession();
  const params = linkListParamsSchema.parse(await searchParams);
  const writer = can(actor.workspace.role, "link:write");
  const { links } = getContainer();
  const [result, tags, settings] = await Promise.all([
    links.list(actor, {
      search: params.q,
      tag: params.tag,
      health: params.health,
      status: params.status,
      sort: params.sort,
      page: params.page,
      pageSize: params.pageSize ?? 20,
    }),
    links.listTags(actor),
    getContainer().settings.get(),
  ]);
  return (
    <>
      <PageHeader
        title="Links"
        description={
          writer
            ? "Search, filter and manage every short link in this workspace."
            : "Search and filter this workspace's links. Your role is read-only."
        }
        actions={writer ? <ImportLinksSheet /> : undefined}
      />
      <Suspense>
        <LinksTable
          links={result.items}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          tags={tags}
          readOnly={!writer}
          healthEnabled={settings.healthMonitorEnabled}
        />
      </Suspense>
    </>
  );
}
