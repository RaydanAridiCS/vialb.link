import { Target } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countryName, formatNumber } from "@/lib/format";
import { formatMinor } from "@/lib/conversions";
import { describeRoute } from "@/lib/routing";
import type { ConversionAnalytics, ConversionRow } from "@/server/services/analytics.service";
import { AnalyticsCard } from "./analytics-view";
import { KpiCard } from "./kpi-card";

const percent = (rate: number | null) => (rate === null ? "n/a" : `${rate}%`);

/**
 * Conversions for a link that tracks them: totals, rate and value, then the rate by routing variant,
 * country and device. The rate is a cohort rate (see docs/conversions.md), which the note below says.
 */
export function ConversionsPanel({ data }: { data: ConversionAnalytics }) {
  const route = data.byRoute
    .filter((row) => row.value !== "Unknown")
    .map((row) => ({ ...row, value: describeRoute(row.value, countryName) }));
  const rateChange =
    data.previous && data.rate !== null && data.previous.rate !== null
      ? Math.round((data.rate - data.previous.rate) * 10) / 10
      : null;

  return (
    <section className="space-y-4" aria-label="Conversions" data-testid="conversions-panel">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Conversions" value={data.conversions} icon={<Target />} />
        <KpiCard
          label="Conversion rate"
          value={percent(data.rate)}
          hint={
            rateChange === null
              ? `${formatNumber(data.eligibleClicks)} tracked clicks`
              : `${rateChange > 0 ? "+" : ""}${rateChange} points vs previous period`
          }
        />
        <KpiCard
          label="Value"
          value={
            data.values.length === 0
              ? "None reported"
              : data.values.map((v) => formatMinor(v.totalMinor, v.currency)).join(" · ")
          }
          hint={data.values.length > 1 ? "Currencies are never added together" : undefined}
        />
      </div>
      <AnalyticsCard
        title="Conversion rate by"
        description="Conversions per tracked click. Very recent clicks may not have had time to convert yet."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {route.length > 0 ? <RateTable title="Route or variant" rows={route} /> : null}
          <RateTable
            title="Country"
            rows={data.byCountry.map((r) => ({
              ...r,
              value: r.value === "Unknown" ? r.value : countryName(r.value),
            }))}
          />
          <RateTable title="Device" rows={data.byDevice} />
        </div>
      </AnalyticsCard>
    </section>
  );
}

function RateTable({ title, rows }: { title: string; rows: ConversionRow[] }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{title}</TableHead>
              <TableHead className="text-right">Clicks</TableHead>
              <TableHead className="text-right">Conversions</TableHead>
              <TableHead className="text-right">Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.value}>
                <TableCell className="max-w-48 truncate">{row.value}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {formatNumber(row.clicks)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {formatNumber(row.conversions)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {percent(row.rate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
