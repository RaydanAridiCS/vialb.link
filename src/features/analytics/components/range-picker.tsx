"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ANALYTICS_RANGES, type AnalyticsRange } from "@/lib/constants";
import { cn } from "@/lib/utils";

const LABELS: Record<AnalyticsRange, { short: string; long: string }> = {
  "24h": { short: "24h", long: "Last 24 hours" },
  "7d": { short: "7d", long: "Last 7 days" },
  "30d": { short: "30d", long: "Last 30 days" },
  "90d": { short: "90d", long: "Last 90 days" },
  all: { short: "All", long: "All time" },
  custom: { short: "Custom", long: "Custom range" },
};

function toDateInput(iso: string | undefined) {
  return iso ? iso.slice(0, 10) : "";
}

export function RangePicker({
  range,
  includeBots,
  from,
  to,
  ranges = ANALYTICS_RANGES,
  showBots = true,
  compare = true,
  showCompare = false,
}: {
  range: AnalyticsRange;
  includeBots: boolean;
  from?: string;
  to?: string;
  ranges?: readonly AnalyticsRange[];
  showBots?: boolean;
  /** Comparison with the previous period is on. */
  compare?: boolean;
  showCompare?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [customFrom, setCustomFrom] = useState(toDateInput(from));
  const [customTo, setCustomTo] = useState(toDateInput(to));

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Date range"
          className="inline-flex rounded-xl border bg-card p-1 shadow-xs"
        >
          {ranges.map((key) => {
            const active = key === range;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                title={LABELS[key].long}
                onClick={() =>
                  update(key === "custom" ? { range: key } : { range: key, from: null, to: null })
                }
                className={cn(
                  "rounded-lg px-3 py-1.5 font-mono text-xs transition-colors outline-none focus-visible:ring-4 focus-visible:ring-ring/25",
                  active
                    ? "bg-ink text-ink-foreground shadow-xs dark:bg-foreground dark:text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span aria-hidden>{LABELS[key].short}</span>
                <span className="sr-only">{LABELS[key].long}</span>
              </button>
            );
          })}
        </div>
        {pending ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
        ) : null}
        {range === "custom" ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!customFrom || !customTo) return;
              update({
                from: new Date(`${customFrom}T00:00:00Z`).toISOString(),
                to: new Date(`${customTo}T23:59:59Z`).toISOString(),
              });
            }}
          >
            <div className="flex items-center gap-2">
              <Label htmlFor="from" className="sr-only">
                From
              </Label>
              <Input
                id="from"
                type="date"
                className="h-9 w-40"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-muted-foreground" aria-hidden>
                to
              </span>
              <Label htmlFor="to" className="sr-only">
                To
              </Label>
              <Input
                id="to"
                type="date"
                className="h-9 w-40"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline">
              Apply
            </Button>
          </form>
        ) : null}
      </div>
      {showCompare && range !== "all" ? (
        <div className="flex h-9 items-center gap-2">
          <Switch
            id="compare"
            checked={compare}
            onCheckedChange={(checked) => update({ compare: checked ? null : "0" })}
          />
          <Label htmlFor="compare" className="text-sm font-normal text-muted-foreground">
            Compare to previous period
          </Label>
        </div>
      ) : null}
      {showBots ? (
        <div className="flex h-9 items-center gap-2">
          <Switch
            id="bots"
            checked={includeBots}
            onCheckedChange={(checked) => update({ bots: checked ? "1" : null })}
          />
          <Label htmlFor="bots" className="text-sm font-normal text-muted-foreground">
            Include bots
          </Label>
        </div>
      ) : null}
    </div>
  );
}
