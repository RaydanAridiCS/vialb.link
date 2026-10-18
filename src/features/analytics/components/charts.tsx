"use client";

import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const clicksConfig = { clicks: { label: "Clicks", color: "var(--chart-1)" } } satisfies ChartConfig;

function formatBucket(iso: string, bucket: "hour" | "day") {
  const date = new Date(iso);
  return bucket === "hour"
    ? date.toLocaleString("en-US", { hour: "numeric", day: "numeric", month: "short", timeZone: "UTC" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Zero-filled clicks over time (UTC buckets). */
export function ClicksChart({
  data,
  bucket,
  className,
  compact = false,
}: {
  data: { bucket: string; clicks: number }[];
  bucket: "hour" | "day";
  className?: string;
  compact?: boolean;
}) {
  return (
    <ChartContainer
      config={clicksConfig}
      className={cn("aspect-auto h-64 w-full", compact && "h-24", className)}
    >
      <AreaChart data={data} margin={{ left: compact ? 0 : -16, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fillClicks" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-clicks)" stopOpacity={0.5} />
            <stop offset="95%" stopColor="var(--color-clicks)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        {compact ? null : <CartesianGrid vertical={false} />}
        <XAxis
          dataKey="bucket"
          hide={compact}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          tickFormatter={(v: string) => formatBucket(v, bucket)}
        />
        <YAxis hide={compact} allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent labelFormatter={(v) => formatBucket(String(v), bucket)} indicator="line" />
          }
        />
        <Area
          dataKey="clicks"
          type="monotone"
          fill="url(#fillClicks)"
          stroke="var(--color-clicks)"
          strokeWidth={2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

const DONUT_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function DonutChart({ data, label }: { data: { value: string; clicks: number }[]; label: string }) {
  const config = Object.fromEntries(
    data.map((d, i) => [d.value, { label: d.value, color: DONUT_COLORS[i % DONUT_COLORS.length] }]),
  ) satisfies ChartConfig;
  if (data.length === 0) return <EmptyChart />;
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-56" aria-label={label}>
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="value" hideLabel />} />
        <Pie
          data={data}
          dataKey="clicks"
          nameKey="value"
          innerRadius={50}
          strokeWidth={4}
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell key={d.value} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="value" />} />
      </PieChart>
    </ChartContainer>
  );
}

export function EmptyChart({ message = "No data for this period" }: { message?: string }) {
  return <div className="grid h-40 place-items-center text-sm text-muted-foreground">{message}</div>;
}
