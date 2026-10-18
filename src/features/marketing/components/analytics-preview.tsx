import { MousePointerClick, Users } from "lucide-react";
import { BarList } from "@/features/analytics/components/bar-list";
import { ClicksChart } from "@/features/analytics/components/charts";
import { Delta } from "@/features/analytics/components/kpi-card";
import type { LinkAnalytics } from "@/server/services/analytics.service";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A browser-framed slice of the real analytics report, rendered from demo data. */
export function AnalyticsPreview({
  data,
  host,
  code,
  className,
}: {
  data: LinkAnalytics;
  host: string;
  code: string;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-[1.25rem] border bg-card shadow-lifted", className)}>
      <div className="flex items-center gap-3 border-b bg-muted/60 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <div className="mx-auto w-full max-w-sm truncate rounded-md border bg-card px-3 py-1 text-center font-mono text-[11px] text-muted-foreground">
          {host}/dashboard/links/{code}
        </div>
        <div className="w-12" aria-hidden />
      </div>
      <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[1fr_240px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border p-3.5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MousePointerClick className="size-3.5" aria-hidden /> Total clicks
              </p>
              <p className="mt-1.5 font-mono text-2xl font-medium tabular-nums">
                {formatNumber(data.summary.totalClicks)}
              </p>
              <div className="mt-1 text-[11px] text-muted-foreground">
                <Delta value={data.changePct} suffix="vs last month" />
              </div>
            </div>
            <div className="rounded-xl border p-3.5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" aria-hidden /> Unique visitors
              </p>
              <p className="mt-1.5 font-mono text-2xl font-medium tabular-nums">
                {formatNumber(data.summary.uniqueVisitors)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">No cookies, no raw IPs</p>
            </div>
          </div>
          <div className="rounded-xl border p-3.5">
            <p className="mb-2 text-xs text-muted-foreground">Clicks over the last 30 days</p>
            <ClicksChart data={data.timeseries} bucket={data.range.bucket} className="h-40" />
          </div>
        </div>
        <div className="rounded-xl border p-3.5">
          <p className="mb-2 text-xs text-muted-foreground">Top sources</p>
          <BarList
            items={data.dimensions.referrer_host.slice(0, 6)}
            unknownLabel="Direct"
            total={data.summary.totalClicks}
          />
        </div>
      </div>
    </div>
  );
}
