import { Link2, MousePointerClick, Plus, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <>
      <PageHeader
        title={`Hi, ${session.user.name.split(" ")[0] ?? "there"}`}
        description="Here's how your links are doing."
        actions={
          <Button asChild>
            <Link href="/dashboard/links/new">
              <Plus className="size-4" /> New link
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Total links" value={stats.totalLinks} icon={<Link2 className="size-4" />} />
        <KpiCard
          label="Clicks · 7 days"
          value={stats.clicks7d}
          icon={<MousePointerClick className="size-4" />}
          hint="Humans only"
        />
        <KpiCard
          label="Clicks · 30 days"
          value={stats.clicks30d}
          icon={<TrendingUp className="size-4" />}
          hint="Humans only"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Clicks over the last 30 days</CardTitle>
            <CardDescription>Daily totals across all of your links (UTC).</CardDescription>
          </CardHeader>
          <CardContent>
            <ClicksChart data={daily} bucket="day" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top links</CardTitle>
            <CardDescription>By clicks in the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topLinks.length === 0 ? (
              <div className="space-y-3 py-6 text-center text-sm text-muted-foreground">
                <p>No clicks yet. Share a link to see it here.</p>
                {stats.totalLinks === 0 ? (
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/dashboard/links/new">Create your first link</Link>
                  </Button>
                ) : null}
              </div>
            ) : (
              <ol className="space-y-2">
                {stats.topLinks.map((link, index) => (
                  <li key={link.id} className="flex items-center justify-between gap-3 text-sm">
                    <Link
                      href={`/dashboard/links/${link.id}`}
                      className="flex min-w-0 items-center gap-2 hover:underline"
                    >
                      <span className="w-4 text-muted-foreground tabular-nums">{index + 1}</span>
                      <span className="truncate font-medium">{link.title ?? `/${link.code}`}</span>
                    </Link>
                    <span className="text-muted-foreground tabular-nums">{formatNumber(link.clicks)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
