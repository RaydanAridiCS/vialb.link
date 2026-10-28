import { Bot, Globe2, Lightbulb, Monitor, MousePointerClick, Smartphone, Tablet, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AnalyticsRange } from "@/lib/constants";
import { CountryCode } from "@/components/country-code";
import { countryName, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { describeRoute, type RoutingRule } from "@/lib/routing";
import { cn } from "@/lib/utils";
import type { LinkAnalytics } from "@/server/services/analytics.service";
import { alignPrevious, compareValue } from "../compare";
import { deriveInsights, type Insight } from "../insights";
import { BarList } from "./bar-list";
import { ClicksChart, DonutChart } from "./charts";
import { ConversionsPanel } from "./conversions-panel";
import { Heatmap } from "./heatmap";
import { Delta, KpiCard } from "./kpi-card";
import { RangePicker } from "./range-picker";
import { VariantsPanel } from "./variants-panel";

export function AnalyticsCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("flex min-w-0 flex-col rounded-2xl border bg-card p-5 shadow-paper sm:p-6", className)}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-medium tracking-tight">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

const tabListClass = "h-8 rounded-lg bg-muted p-0.5";
const tabTriggerClass = "h-7 rounded-md px-2.5 text-xs";

export function InsightCards({ insights, className }: { insights: Insight[]; className?: string }) {
  if (insights.length === 0) return null;
  return (
    <section
      aria-label="Insights"
      className={cn(
        "grid gap-3 sm:grid-cols-2",
        insights.length === 3 && "xl:grid-cols-3",
        insights.length >= 4 && "xl:grid-cols-4",
        className,
      )}
    >
      {insights.map((insight) => (
        <div
          key={insight.id}
          className="relative overflow-hidden rounded-2xl border border-primary/15 bg-accent/60 p-5 dark:bg-accent/40"
        >
          <p className="flex items-center gap-1.5 text-xs text-accent-foreground">
            <Lightbulb className="size-3.5" aria-hidden />
            {insight.label}
          </p>
          <p className="mt-2 truncate font-display text-2xl leading-tight">{insight.value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{insight.detail}</p>
        </div>
      ))}
    </section>
  );
}

const DEVICE_ICONS: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  bot: Bot,
};

/**
 * The full analytics report for one link. Shared by the dashboard page and the
 * public demo, so both always look the same.
 */
export function AnalyticsView({
  data,
  range,
  includeBots,
  from,
  to,
  rangeOptions,
  showBotsToggle = true,
  notice,
  aside,
  compare = false,
  compareControl = false,
  routingRules,
}: {
  data: LinkAnalytics;
  /** Show change against the previous period (needs `data.previousDimensions`). */
  compare?: boolean;
  /** Offer the "compare to previous period" switch (the live page does, the demo does not). */
  compareControl?: boolean;
  /** The link's smart-routing rules, to show the results of an A/B split. */
  routingRules?: RoutingRule[];
  range: AnalyticsRange;
  includeBots: boolean;
  from?: string;
  to?: string;
  rangeOptions?: readonly AnalyticsRange[];
  showBotsToggle?: boolean;
  /** Rendered under the toolbar, e.g. a range error. */
  notice?: ReactNode;
  /** Optional panel shown next to the clicks chart on wide screens. */
  aside?: ReactNode;
}) {
  const d = data.dimensions;
  const prev = compare ? data.previousDimensions : undefined;
  const chartData = alignPrevious(data.timeseries, compare ? data.previousTimeseries : undefined);
  const uniqueChange = compare
    ? compareValue(data.summary.uniqueVisitors, data.previous.uniqueVisitors).pct
    : undefined;
  const botChange = compare ? compareValue(data.summary.botClicks, data.previous.botClicks).pct : undefined;
  const total = data.summary.totalClicks;
  const topCountry = d.country.find((c) => c.value !== "Unknown");
  // The KPI strip already names the top country.
  const insights = deriveInsights(data).filter((i) => i.id !== "country");
  // Clicks on links with smart routing, by the rule that decided where they went.
  const routes = d.routed_by
    .filter((item) => item.value !== "Unknown")
    .map((item) => ({ ...item, value: describeRoute(item.value, countryName) }));
  const routedTotal = routes.reduce((sum, item) => sum + item.clicks, 0);
  const utm = {
    source: d.utm_source.filter((i) => i.value !== "Unknown"),
    medium: d.utm_medium.filter((i) => i.value !== "Unknown"),
    campaign: d.utm_campaign.filter((i) => i.value !== "Unknown"),
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 pb-2">
        <RangePicker
          range={range}
          includeBots={includeBots}
          from={from}
          to={to}
          ranges={rangeOptions}
          showBots={showBotsToggle}
          compare={compare}
          showCompare={compareControl}
        />
        {notice}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="analytics-kpis">
        <KpiCard
          label="Total clicks"
          value={total}
          changePct={data.changePct}
          icon={<MousePointerClick />}
          sparkline={data.timeseries.map((p) => p.clicks)}
        />
        <KpiCard
          label="Unique visitors (per day)"
          value={data.summary.uniqueVisitors}
          changePct={uniqueChange}
          hint="Counted once per day: someone back on another day counts again"
          icon={<Users />}
          sparkline={data.uniqueTimeseries?.map((p) => p.visitors)}
        />
        <KpiCard
          label="Top country"
          value={topCountry ? countryName(topCountry.value) : "None yet"}
          hint={
            topCountry
              ? `${Math.round((topCountry.clicks / Math.max(total, 1)) * 100)}% of clicks`
              : "Waiting for the first click"
          }
          icon={<Globe2 />}
        />
        <KpiCard
          label="Bot clicks"
          value={data.summary.botClicks}
          changePct={botChange}
          hint={includeBots ? "Included in totals" : "Filtered out of totals"}
          icon={<Bot />}
        />
      </div>

      {data.conversions ? <ConversionsPanel data={data.conversions} /> : null}

      <InsightCards insights={insights} />

      <div className={cn("grid gap-4 [&>*]:min-w-0", aside && "xl:grid-cols-[1fr_340px]")}>
        <AnalyticsCard
          title="Clicks over time"
          description={`Per ${data.range.bucket}, UTC`}
          action={
            <div className="text-right">
              <p className="font-mono text-2xl font-medium tabular-nums">{formatNumber(total)}</p>
              <div className="text-xs text-muted-foreground">
                <Delta value={data.changePct} suffix="" />
              </div>
            </div>
          }
        >
          <ClicksChart data={chartData} bucket={data.range.bucket} />
        </AnalyticsCard>
        {aside}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <AnalyticsCard title="Traffic sources" description="Where people found the link">
          <BarList
            items={d.referrer_host}
            unknownLabel="Direct or unknown"
            empty="No referrers yet (direct traffic)"
            total={total}
            previous={prev?.referrer_host}
          />
        </AnalyticsCard>
        <Tabs defaultValue="source" className="gap-0">
          <AnalyticsCard
            title="Campaigns"
            description="From UTM tags on the visited link"
            className="h-full"
            action={
              <TabsList className={tabListClass}>
                <TabsTrigger value="source" className={tabTriggerClass}>
                  Source
                </TabsTrigger>
                <TabsTrigger value="medium" className={tabTriggerClass}>
                  Medium
                </TabsTrigger>
                <TabsTrigger value="campaign" className={tabTriggerClass}>
                  Campaign
                </TabsTrigger>
              </TabsList>
            }
          >
            {(["source", "medium", "campaign"] as const).map((key) => (
              <TabsContent key={key} value={key}>
                <BarList
                  items={utm[key]}
                  empty="No UTM-tagged visits yet"
                  total={total}
                  previous={prev?.[`utm_${key}` as const]}
                />
              </TabsContent>
            ))}
          </AnalyticsCard>
        </Tabs>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Tabs defaultValue="country" className="gap-0">
          <AnalyticsCard
            title="Locations"
            description="Resolved from IP, which is then discarded"
            className="h-full"
            action={
              <TabsList className={tabListClass}>
                <TabsTrigger value="country" className={tabTriggerClass}>
                  Countries
                </TabsTrigger>
                <TabsTrigger value="city" className={tabTriggerClass}>
                  Cities
                </TabsTrigger>
                <TabsTrigger value="language" className={tabTriggerClass}>
                  Languages
                </TabsTrigger>
              </TabsList>
            }
          >
            <TabsContent value="country">
              <BarList items={d.country} kind="country" total={total} previous={prev?.country} />
            </TabsContent>
            <TabsContent value="city">
              <BarList items={d.city} total={total} previous={prev?.city} />
            </TabsContent>
            <TabsContent value="language">
              <BarList items={d.language} total={total} previous={prev?.language} />
            </TabsContent>
          </AnalyticsCard>
        </Tabs>
        <Tabs defaultValue="browser" className="gap-0">
          <AnalyticsCard
            title="Technology"
            description="Device, browser and operating system"
            className="h-full"
          >
            <DonutChart data={d.device_type} label="Clicks by device type" />
            <div className="mt-6 border-t pt-5">
              <TabsList className={cn(tabListClass, "mb-3")}>
                <TabsTrigger value="browser" className={tabTriggerClass}>
                  Browsers
                </TabsTrigger>
                <TabsTrigger value="os" className={tabTriggerClass}>
                  Operating systems
                </TabsTrigger>
              </TabsList>
              <TabsContent value="browser">
                <BarList items={d.browser.slice(0, 5)} total={total} previous={prev?.browser} />
              </TabsContent>
              <TabsContent value="os">
                <BarList items={d.os.slice(0, 5)} total={total} previous={prev?.os} />
              </TabsContent>
            </div>
          </AnalyticsCard>
        </Tabs>
      </div>

      {routingRules?.find((rule) => (rule.variants?.length ?? 0) > 0) ? (
        <VariantsPanel
          rule={routingRules.find((rule) => (rule.variants?.length ?? 0) > 0) as RoutingRule}
          routes={d.routed_by}
          conversions={data.conversions?.byRoute}
        />
      ) : null}

      {routes.length > 0 ? (
        <AnalyticsCard title="Smart routing" description="Where visitors were sent by this link's rules">
          <BarList items={routes} total={routedTotal} />
        </AnalyticsCard>
      ) : null}

      <AnalyticsCard title="When people click" description="Weekday and hour, UTC. Darker means more clicks.">
        <Heatmap cells={data.heatmap} />
      </AnalyticsCard>

      <AnalyticsCard
        title="Recent clicks"
        description="The 25 most recent clicks in this range. IP addresses are never stored."
      >
        {data.recent.length === 0 ? (
          <p className="grid min-h-32 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
            No clicks in this range yet.
          </p>
        ) : (
          <div className="relative -mx-2 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>When</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Browser and OS</TableHead>
                  <TableHead>Referrer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((click, i) => {
                  const DeviceIcon = DEVICE_ICONS[click.deviceType] ?? Monitor;
                  return (
                    <TableRow key={`${click.occurredAt}-${i}`}>
                      <TableCell
                        className="font-mono text-xs whitespace-nowrap text-muted-foreground"
                        title={formatDateTime(click.occurredAt)}
                      >
                        {formatRelative(click.occurredAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {click.country ? (
                          <>
                            <CountryCode code={click.country} className="mr-2 align-[1px]" />
                            {click.city ?? countryName(click.country)}
                            <span className="ml-1 text-muted-foreground">{click.country}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 capitalize">
                          <DeviceIcon className="size-3.5 text-muted-foreground" aria-hidden />
                          {click.deviceType}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {click.browser ?? "Unknown"}
                        <span className="text-muted-foreground"> on {click.os ?? "Unknown"}</span>
                      </TableCell>
                      <TableCell>
                        {click.referrerHost ? (
                          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                            {click.referrerHost.replace(/^www\./, "")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Direct</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </AnalyticsCard>
    </div>
  );
}
