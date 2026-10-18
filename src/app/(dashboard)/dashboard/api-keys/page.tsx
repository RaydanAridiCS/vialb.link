import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { ApiKeysManager } from "@/features/api-keys/components/api-keys-manager";
import { env } from "@/lib/env";
import { requireSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  const { actor } = await requireSession();
  const keys = await getContainer().apiKeys.list(actor);
  return (
    <>
      <PageHeader
        title="API keys"
        description={
          <>
            Use the REST API to create and manage links programmatically.{" "}
            <Link href="/docs/api" className="text-foreground underline underline-offset-4">
              Read the API reference
            </Link>
            .
          </>
        }
      />
      <ApiKeysManager keys={keys} siteUrl={env.SITE_URL} />
    </>
  );
}
