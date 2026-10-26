import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell";
import { LinksTable } from "@/features/links/components/links-table";
import { linkListParamsSchema } from "@/features/links/schemas";
import { requireSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Links" };

export default async function LinksPage({ searchParams }: PageProps<"/dashboard/links">) {
  const { actor } = await requireSession();
  const params = linkListParamsSchema.parse(await searchParams);
  const { links } = getContainer();
  const [result, tags] = await Promise.all([
    links.list(actor, {
      search: params.q,
      tag: params.tag,
      status: params.status,
      sort: params.sort,
      page: params.page,
      pageSize: params.pageSize ?? 20,
    }),
    links.listTags(actor),
  ]);
  return (
    <>
      <PageHeader title="Links" description="Search, filter and manage every short link you own." />
      <Suspense>
        <LinksTable
          links={result.items}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          tags={tags}
        />
      </Suspense>
    </>
  );
}
