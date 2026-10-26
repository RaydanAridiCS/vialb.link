import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { APP_NAME } from "@/lib/constants";
import { BioPageView } from "@/features/bio/components/bio-page-view";
import { getContainer } from "@/server/container";

// Served at /@handle: next.config.ts rewrites that path here, and the proxy sends /u/handle back to it.

const loadPage = cache((handle: string) => getContainer().bio.getPublic(handle));

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const page = await loadPage(handle);
  if (!page) return { title: "Page not found", robots: { index: false, follow: false } };
  const name = page.displayName ?? `@${page.handle}`;
  const description = page.bio ?? `${name} on ${APP_NAME}`;
  return {
    title: `${name} (@${page.handle})`,
    description,
    alternates: { canonical: `/@${page.handle}` },
    openGraph: { type: "profile", title: name, description, url: `/@${page.handle}` },
    twitter: { card: "summary", title: name, description },
  };
}

export default async function PublicBioPage({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  const page = await loadPage(handle);
  if (!page) notFound();
  // /@Alice and /@alice are one page.
  if (handle !== page.handle) permanentRedirect(`/@${page.handle}`);
  return <BioPageView page={page} />;
}
