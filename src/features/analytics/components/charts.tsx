"use client";

import { useSyncExternalStore } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const clicksConfig = { clicks: { label: "Clicks", color: "var(--chart-1)" } } satisfies ChartConfig;

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True when the user asked for less motion. Server renders assume reduced motion. */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

function formatBucket(iso: string, bucket: "hour" | "day") {
  const date = new Date(iso);
  return bucket === "hour"
    ? date.toLocaleString("en-US", { hour: "numeric", day: "numeric", month: "short", timeZone: "UTC" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const tick = { fontSize: 11, fontFamily: "var(--font-mono)", fill: "var(--muted-foreground)" };

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
  const reducedMotion = useReducedMotion();
  return (
    <ChartContainer
      config={clicksConfig}
      className={cn("aspect-auto h-72 w-full", compact && "h-24", className)}
    >
      <AreaChart
        data={data}
        margin={{ left: compact ? 0 : -12, right: compact ? 4 : 20, top: 12, bottom: 0 }}
      >
        <defs>
          <linearGradient id="fillClicks" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-clicks)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--color-clicks)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {compact ? null : <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--border)" />}
        <XAxis
          dataKey="bucket"
          hide={compact}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
          tickMargin={10}
          tick={tick}
          tickFormatter={(v: string) => formatBucket(v, bucket)}
        />
        <YAxis
          hide={compact}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={44}
          tick={tick}
          tickFormatter={(v: number) => formatNumber(v)}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "4 4" }}
          content={
            <ChartTooltipContent
              className="rounded-lg"
              labelFormatter={(v) => formatBucket(String(v), bucket)}
              indicator="line"
            />
          }
        />
        <Area
          dataKey="clicks"
          type="monotone"
          fill="url(#fillClicks)"
          stroke="var(--color-clicks)"
          strokeWidth={2}
          activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--card)" }}
          isAnimationActive={!reducedMotion}
          animationDuration={900}
        />
      </AreaChart>
    </ChartContainer>
  );
}

/** Colors follow the entity, never its rank, so "mobile" is always the same hue. */
const KNOWN_COLORS: Record<string, string> = {
  desktop: "var(--chart-1)",
  mobile: "var(--chart-2)",
  tablet: "var(--chart-3)",
  bot: "var(--chart-4)",
  other: "var(--chart-5)",
  Unknown: "var(--chart-5)",
};
const FALLBACK_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function colorFor(value: string, index: number) {
  return KNOWN_COLORS[value] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length] ?? "var(--chart-1)";
}

export function DonutChart({ data, label }: { data: { value: string; clicks: number }[]; label: string }) {
  const reducedMotion = useReducedMotion();
  const config = Object.fromEntries(
    data.map((d, i) => [d.value, { label: d.value, color: colorFor(d.value, i) }]),
  ) satisfies ChartConfig;
  if (data.length === 0) return <EmptyChart />;
  const total = data.reduce((sum, d) => sum + d.clicks, 0);
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative">
        <ChartContainer config={config} className="aspect-square h-44" aria-label={label}>
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="value" hideLabel />} />
            <Pie
              data={data}
              dataKey="clicks"
              nameKey="value"
              innerRadius={58}
              outerRadius={84}
              paddingAngle={0}
              stroke="var(--card)"
              strokeWidth={2}
              cornerRadius={4}
              isAnimationActive={!reducedMotion}
            >
              {data.map((d, i) => (
                <Cell key={d.value} fill={colorFor(d.value, i)} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-mono text-xl font-medium tabular-nums">{formatNumber(total)}</p>
            <p className="text-xs text-muted-foreground">clicks</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
        {data.map((d, i) => (
          <li key={d.value} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: colorFor(d.value, i) }}
              />
              <span className="truncate capitalize">{d.value === "Unknown" ? "Unknown" : d.value}</span>
            </span>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {Math.round((d.clicks / Math.max(total, 1)) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyChart({ message = "No data for this period" }: { message?: string }) {
  return (
    <div className="grid h-40 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
      {message}
    </div>
  );
}
