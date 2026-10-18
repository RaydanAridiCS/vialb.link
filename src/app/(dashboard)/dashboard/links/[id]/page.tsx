import { Bot, Download, Lock, MousePointerClick, Pencil, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarList } from "@/features/analytics/components/bar-list";
import { ClicksChart, DonutChart } from "@/features/analytics/components/charts";
import { Heatmap } from "@/features/analytics/components/heatmap";
import { KpiCard } from "@/features/analytics/components/kpi-card";
import { RangePicker } from "@/features/analytics/components/range-picker";
import { parseAnalyticsParams } from "@/features/analytics/schemas";
import { LinkQuickActions } from "@/features/links/components/link-actions";
import { loadOwnedLink } from "@/features/links/queries";
import { countryFlag, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { requireSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { ValidationError } from "@/server/errors";

export const metadata: Metadata = { title: "Link analytics" };

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function LinkAnalyticsPage({
  params,
  searchParams,
}: PageProps<"/dashboard/links/[id]">) {
  const [{ id }, rawQuery] = await Promise.all([params, searchParams]);
  const { actor } = await requireSession();
  const link = await loadOwnedLink(id);
  const query = parseAnalyticsParams(rawQuery);

  let data;
  let rangeError: string | null = null;
  try {
    data = await getContainer().analytics.getLinkAnalytics(actor, link.id, {
      range: query.range,
      from: query.from,
      to: query.to,
      includeBots: query.bots,
    });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    rangeError = error.message;
    data = await getContainer().analytics.getLinkAnalytics(actor, link.id, {
      range: "7d",
      includeBots: query.bots,
    });
  }

  const exportQuery = new URLSearchParams({ range: query.range, ...(query.bots ? { bots: "1" } : {}) });
  if (query.range === "custom" && query.from && query.to) {
    exportQuery.set("from", query.from.toISOString());
    exportQuery.set("to", query.to.toISOString());
  }
  const d = data.dimensions;

  return (
    <>
      <PageHeader
        title={link.title ?? `/${link.code}`}
        description={
          <div className="space-y-1">
            <a
              href={link.shortUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-primary hover:underline"
            >
              {link.shortUrl}
            </a>
            <p className="truncate">→ {link.destinationUrl}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Badge variant={link.status === "active" ? "default" : "secondary"}>
                {link.status.replace("_", " ")}
              </Badge>
              {link.hasPassword ? (
                <Badge variant="outline">
                  <Lock className="size-3" /> Password
                </Badge>
              ) : null}
              {link.expiresAt ? (
                <Badge variant="outline">Expires {formatDateTime(link.expiresAt)}</Badge>
              ) : null}
              {link.maxClicks !== null ? (
                <Badge variant="outline">
                  {formatNumber(link.clickCount)} / {formatNumber(link.maxClicks)} visits
                </Badge>
              ) : null}
            </div>
          </div>
        }
        actions={
          <>
            <LinkQuickActions link={link} />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/links/${link.id}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/app/links/${link.id}/clicks.csv?${exportQuery}`} download>
                <Download className="size-4" /> Export CSV
              </a>
            </Button>
          </>
        }
      />

      <div className="mb-6 space-y-2">
        <RangePicker
          range={rangeError ? "7d" : query.range}
          includeBots={query.bots}
          from={query.from?.toISOString()}
          to={query.to?.toISOString()}
        />
        {rangeError ? (
          <p role="alert" className="text-sm text-destructive">
            {rangeError} Showing the last 7 days instead.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3" data-testid="analytics-kpis">
        <KpiCard
          label="Total clicks"
          value={data.summary.totalClicks}
          changePct={data.changePct}
          icon={<MousePointerClick className="size-4" />}
        />
        <KpiCard
          label="Unique visitors"
          value={data.summary.uniqueVisitors}
          hint="Daily-rotating anonymous IDs"
          icon={<Users className="size-4" />}
        />
        <KpiCard
          label="Bot clicks"
          value={data.summary.botClicks}
          hint={query.bots ? "Included above" : "Excluded above"}
          icon={<Bot className="size-4" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Section
          title="Clicks over time"
          description={`Per ${data.range.bucket}, UTC`}
          className="lg:col-span-2"
        >
          <ClicksChart data={data.timeseries} bucket={data.range.bucket} />
        </Section>
        <Section title="Devices">
          <DonutChart data={d.device_type} label="Clicks by device type" />
        </Section>
        <Section title="When people click" description="Weekday × hour (UTC)" className="lg:col-span-3">
          <Heatmap cells={data.heatmap} />
        </Section>
        <Section title="Countries">
          <BarList items={d.country} kind="country" />
        </Section>
        <Section title="Cities">
          <BarList items={d.city} />
        </Section>
        <Section title="Referrers">
          <BarList items={d.referrer_host} unknownLabel="Direct" empty="No referrers (direct traffic)" />
        </Section>
        <Section title="Browsers">
          <BarList items={d.browser} />
        </Section>
        <Section title="Operating systems">
          <BarList items={d.os} />
        </Section>
        <Section title="Languages">
          <BarList items={d.language} />
        </Section>
        <Section title="UTM source">
          <BarList items={d.utm_source.filter((i) => i.value !== "Unknown")} empty="No UTM-tagged visits" />
        </Section>
        <Section title="UTM medium">
          <BarList items={d.utm_medium.filter((i) => i.value !== "Unknown")} empty="No UTM-tagged visits" />
        </Section>
        <Section title="UTM campaign">
          <BarList items={d.utm_campaign.filter((i) => i.value !== "Unknown")} empty="No UTM-tagged visits" />
        </Section>
      </div>

      <Section
        title="Recent clicks"
        description="The 25 most recent clicks in this range. IP addresses are never stored."
        className="mt-4"
      >
        {data.recent.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No clicks in this range yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Browser / OS</TableHead>
                  <TableHead>Referrer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((click, i) => (
                  <TableRow key={`${click.occurredAt}-${i}`}>
                    <TableCell className="whitespace-nowrap" title={formatDateTime(click.occurredAt)}>
                      {formatRelative(click.occurredAt)}
                    </TableCell>
                    <TableCell>
                      {click.country ? `${countryFlag(click.country)} ${click.country}` : "Unknown"}
                      {click.city ? `, ${click.city}` : ""}
                    </TableCell>
                    <TableCell className="capitalize">
                      {click.deviceType}
                      {click.isBot ? (
                        <Badge variant="outline" className="ml-1">
                          bot
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {click.browser ?? "Unknown"} / {click.os ?? "Unknown"}
                    </TableCell>
                    <TableCell>{click.referrerHost ?? "Direct"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </>
  );
}
