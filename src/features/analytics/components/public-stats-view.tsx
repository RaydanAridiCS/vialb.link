import { MousePointerClick, Users } from "lucide-react";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { PublicLinkStats } from "@/server/services/analytics.service";
import { AnalyticsCard } from "./analytics-view";
import { BarList } from "./bar-list";
import { ClicksChart, DonutChart } from "./charts";
import { KpiCard } from "./kpi-card";

/**
 * The read-only stats page shown to anyone with the address. Aggregates only: there is deliberately no
 * list of recent clicks, no visitor identifiers, no cities, campaign names or routing details here.
 */
export function PublicStatsView({ stats }: { stats: PublicLinkStats }) {
  return (
    <div className="space-y-6" data-testid="public-stats">
      <div className="space-y-1">
        <h1 className="font-display text-3xl">{stats.label}</h1>
        <p className="text-sm text-muted-foreground">
          Link statistics for the last 30 days. Bots are not counted. Updated{" "}
          {formatDateTime(stats.generatedAt)} UTC.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard label="Clicks" value={formatNumber(stats.totalClicks)} icon={<MousePointerClick />} />
        <KpiCard
          label="Unique visitors (per day)"
          value={formatNumber(stats.uniqueVisitors)}
          icon={<Users />}
          hint="Counted once per day: someone who returns on another day counts again."
        />
      </div>

      <AnalyticsCard title="Clicks over time">
        <ClicksChart data={stats.timeseries} bucket="day" />
      </AnalyticsCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <AnalyticsCard title="Countries">
          <BarList items={stats.countries} kind="country" total={stats.totalClicks} />
        </AnalyticsCard>
        <AnalyticsCard title="Traffic sources">
          <BarList items={stats.referrers} unknownLabel="Direct / unknown" total={stats.totalClicks} />
        </AnalyticsCard>
        <AnalyticsCard title="Devices">
          <DonutChart data={stats.devices} label="Clicks" />
        </AnalyticsCard>
      </div>
    </div>
  );
}
