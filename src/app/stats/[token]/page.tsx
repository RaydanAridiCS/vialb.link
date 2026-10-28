import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/site-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { PublicStatsView } from "@/features/analytics/components/public-stats-view";
import { getContainer } from "@/server/container";
import { RateLimitedError } from "@/server/errors";
import { getRequestIp } from "@/server/http/request-context";

export const metadata: Metadata = {
  title: "Link statistics",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Public, read-only stats for one link, reachable only through its unguessable token. A wrong, revoked or
 * deleted token answers exactly like any other unknown page.
 */
export default async function PublicStatsPage({ params }: PageProps<"/stats/[token]">) {
  const { token } = await params;
  let stats;
  try {
    stats = await getContainer().analytics.getPublicStats(token, await getRequestIp());
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return (
        <Shell>
          <p className="py-20 text-center text-muted-foreground" role="alert">
            Too many requests. Please try again in a minute.
          </p>
        </Shell>
      );
    }
    throw error;
  }
  if (!stats) notFound();
  return (
    <Shell>
      <PublicStatsView stats={stats} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
