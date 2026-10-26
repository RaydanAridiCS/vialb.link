import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell";
import { LinksTable } from "@/features/links/components/links-table";
import { linkListParamsSchema } from "@/features/links/schemas";
import { requireAdminSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "All links" };

export default async function AdminLinksPage({ searchParams }: PageProps<"/admin/links">) {
  const { actor } = await requireAdminSession();
  const params = linkListParamsSchema.parse(await searchParams);
  const { links } = getContainer();
  const [result, tags] = await Promise.all([
    links.list(actor, {
      scope: "all",
      search: params.q,
      tag: params.tag,
      status: params.status,
      sort: params.sort,
      page: params.page,
      pageSize: params.pageSize ?? 25,
    }),
    links.listTags(actor, "all"),
  ]);
  return (
    <>
      <PageHeader
        title="All links"
        description="Every link on this instance, including anonymous ones. Disable or delete abusive links."
      />
      <Suspense>
        <LinksTable
          links={result.items}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          tags={tags}
          admin
        />
      </Suspense>
    </>
  );
}
