import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  changePct,
  icon,
}: {
  label: string;
  value: number;
  hint?: ReactNode;
  changePct?: number | null;
  icon?: ReactNode;
}) {
  return (
    <Card className="gap-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <span className="text-muted-foreground" aria-hidden>
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tabular-nums">{formatNumber(value)}</p>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          {changePct !== undefined ? <Delta value={changePct} /> : null}
          {hint}
        </div>
      </CardContent>
    </Card>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span>No previous data</span>;
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium",
        value > 0 && "text-emerald-600 dark:text-emerald-400",
        value < 0 && "text-red-600 dark:text-red-400",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {value > 0 ? "+" : ""}
      {value}% <span className="font-normal text-muted-foreground">vs previous period</span>
    </span>
  );
}
