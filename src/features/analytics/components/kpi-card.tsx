import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  changePct,
  icon,
  sparkline,
  className,
}: {
  label: string;
  value: number | string;
  hint?: ReactNode;
  changePct?: number | null;
  icon?: ReactNode;
  /** Optional series drawn as a small trend line under the number. */
  sparkline?: number[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col rounded-2xl border bg-card p-5 shadow-paper", className)}>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{label}</span>
        <span className="text-muted-foreground/70 [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
      </div>
      {typeof value === "number" ? (
        <p className="mt-3 truncate font-mono text-[2rem] leading-none font-medium tracking-tight tabular-nums">
          {formatNumber(value)}
        </p>
      ) : (
        <p className="mt-3 truncate font-display text-[2.1rem] leading-none">{value}</p>
      )}
      <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {changePct !== undefined ? <Delta value={changePct} /> : null}
        {hint ? <span>{hint}</span> : null}
      </div>
      {sparkline && sparkline.length > 1 ? <Sparkline values={sparkline} className="mt-4" /> : null}
    </div>
  );
}

export function Delta({ value, suffix = "vs previous period" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span>No previous data</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono font-medium",
          value > 0 && "bg-success/10 text-success",
          value < 0 && "bg-destructive/10 text-destructive",
          value === 0 && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-3" aria-hidden />
        {value > 0 ? "+" : ""}
        {value}%
      </span>
      {suffix ? <span>{suffix}</span> : null}
    </span>
  );
}

/** Tiny server-rendered trend line. Decorative: the number above carries the meaning. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const width = 200;
  const height = 36;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const points = values.map((v, i) => [i * step, height - 2 - (v / max) * (height - 4)] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-9 w-full overflow-visible text-primary", className)}
    >
      <path d={area} fill="currentColor" opacity={0.1} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
