import { ArrowRight, ArrowUpRight, Link2, MousePointerClick, Plus, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { AnalyticsCard } from "@/features/analytics/components/analytics-view";
import { ClicksChart } from "@/features/analytics/components/charts";
import { KpiCard } from "@/features/analytics/components/kpi-card";
import { formatNumber } from "@/lib/format";
import { requireSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { session, actor } = await requireSession();
  const stats = await getContainer().links.overview(actor);
  const daily = stats.daily.map((p) => ({ bucket: p.bucket.toISOString(), clicks: p.clicks }));
  const firstName = session.user.name.split(" ")[0] || "there";
  const topMax = Math.max(1, ...stats.topLinks.map((l) => l.clicks));

  return (
    <>
      <PageHeader
        title={`Hi, ${firstName}`}
        description="Here's how your links are doing."
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/links">
              All links <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />

      {stats.totalLinks === 0 ? (
        <section className="relative mb-6 overflow-hidden rounded-3xl border bg-card p-8 shadow-paper sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/15 blur-3xl"
          />
          <div className="relative max-w-xl space-y-4">
            <h2 className="font-display text-3xl leading-tight">Your first link is one paste away.</h2>
            <p className="text-muted-foreground">
              Shorten a URL, share it anywhere, and this page fills up with clicks, countries and sources.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button size="lg" asChild>
                <Link href="/dashboard/links/new">
                  <Plus className="size-4" /> Create your first link
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/demo">See a sample report</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Total links" value={stats.totalLinks} icon={<Link2 />} />
        <KpiCard
          label="Clicks, last 7 days"
          value={stats.clicks7d}
          icon={<MousePointerClick />}
          hint="Humans only"
          sparkline={daily.slice(-7).map((p) => p.clicks)}
        />
        <KpiCard
          label="Clicks, last 30 days"
          value={stats.clicks30d}
          icon={<TrendingUp />}
          hint="Humans only"
          sparkline={daily.map((p) => p.clicks)}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <AnalyticsCard
          title="Clicks over the last 30 days"
          description="Daily totals across all of your links, UTC"
          className="lg:col-span-2"
          action={
            <p className="font-mono text-2xl font-medium tabular-nums">{formatNumber(stats.clicks30d)}</p>
          }
        >
          <ClicksChart data={daily} bucket="day" />
        </AnalyticsCard>
        <AnalyticsCard title="Top links" description="By clicks in the last 30 days">
          {stats.topLinks.length === 0 ? (
            <p className="grid min-h-40 place-items-center rounded-xl border border-dashed px-6 text-center text-sm text-muted-foreground">
              No clicks yet. Share a link to see it here.
            </p>
          ) : (
            <ol className="space-y-1">
              {stats.topLinks.map((link, index) => (
                <li key={link.id}>
                  <Link
                    href={`/dashboard/links/${link.id}`}
                    className="group relative flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted/70"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-0 rounded-md bg-primary/12 dark:bg-primary/18"
                      style={{ width: `${Math.max((link.clicks / topMax) * 100, 2)}%` }}
                    />
                    <span className="relative flex min-w-0 items-center gap-2.5">
                      <span className="w-4 font-mono text-xs text-muted-foreground">{index + 1}</span>
                      <span className="truncate font-medium">{link.title ?? `/${link.code}`}</span>
                    </span>
                    <span className="relative flex items-center gap-1.5 font-mono text-xs tabular-nums">
                      {formatNumber(link.clicks)}
                      <ArrowUpRight
                        className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </AnalyticsCard>
      </div>
    </>
  );
}
