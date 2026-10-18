"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AnalyticsRange } from "@/lib/constants";

const LABELS: Record<AnalyticsRange, string> = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
  custom: "Custom range",
};

function toDateInput(iso: string | undefined) {
  return iso ? iso.slice(0, 10) : "";
}

export function RangePicker({
  range,
  includeBots,
  from,
  to,
}: {
  range: AnalyticsRange;
  includeBots: boolean;
  from?: string;
  to?: string;
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
    <div className="flex flex-wrap items-end gap-3" aria-busy={pending}>
      <div className="space-y-1">
        <Label htmlFor="range" className="text-xs text-muted-foreground">
          Range
        </Label>
        <Select
          value={range}
          onValueChange={(value) =>
            update(value === "custom" ? { range: value } : { range: value, from: null, to: null })
          }
        >
          <SelectTrigger id="range" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(LABELS) as AnalyticsRange[]).map((key) => (
              <SelectItem key={key} value={key}>
                {LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input id="from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input id="to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>
      ) : null}
      <div className="flex h-9 items-center gap-2">
        <Switch
          id="bots"
          checked={includeBots}
          onCheckedChange={(checked) => update({ bots: checked ? "1" : null })}
        />
        <Label htmlFor="bots" className="text-sm font-normal">
          Include bots
        </Label>
      </div>
    </div>
  );
}
