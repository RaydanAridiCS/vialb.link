"use client";

import { Bot, Monitor, Pause, Play, Smartphone, Tablet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/features/analytics/components/charts";
import { CountryCode } from "@/components/country-code";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createRandom, sampleVisit, SCENARIOS, type SampleVisit, type ScenarioId } from "../scenarios";

const DEVICE_ICONS = { desktop: Monitor, mobile: Smartphone, tablet: Tablet, bot: Bot } as const;

interface FeedItem extends SampleVisit {
  id: number;
  at: number;
}

function secondsAgo(at: number, now: number) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  return s < 5 ? "just now" : `${s}s ago`;
}

/** Simulated clicks arriving in real time, drawn from the scenario's traffic profile. */
export function LiveFeed({ scenarioId }: { scenarioId: ScenarioId }) {
  const scenario = SCENARIOS[scenarioId];
  const reducedMotion = useReducedMotion();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [count, setCount] = useState(0);
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const [now, setNow] = useState(0);
  const nextId = useRef(0);
  const random = useRef<() => number>(null);

  const paused = userPaused ?? reducedMotion;

  useEffect(() => {
    if (paused) return;
    const rand = (random.current ??= createRandom(Date.now() >>> 0));
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const visit = sampleVisit(scenario, rand);
      const at = Date.now();
      setItems((prev) => [{ ...visit, id: nextId.current++, at }, ...prev].slice(0, 7));
      setCount((c) => c + 1);
      setNow(at);
      timer = setTimeout(tick, 1800 + rand() * 2200);
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [paused, scenario]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      aria-label="Live clicks"
      className="flex flex-col rounded-2xl border bg-ink p-5 text-ink-foreground shadow-paper sm:p-6"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <span className="relative flex size-2.5">
              {!paused ? (
                <span className="animate-ping-slow absolute inline-flex size-full rounded-full bg-primary" />
              ) : null}
              <span
                className={cn(
                  "relative inline-flex size-2.5 rounded-full",
                  paused ? "bg-white/30" : "bg-primary",
                )}
              />
            </span>
            Live clicks
          </h2>
          <p className="mt-1 text-sm text-white/55">Simulated from this link&apos;s audience</p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="text-white/70 hover:bg-white/10 hover:text-white"
          onClick={() => setUserPaused(!paused)}
          aria-label={paused ? "Resume live clicks" : "Pause live clicks"}
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </Button>
      </div>

      <p className="font-mono text-4xl font-medium tabular-nums" aria-live="polite">
        +{formatNumber(count)}
      </p>
      <p className="text-xs text-white/55">clicks since you opened this page</p>

      <ul className="mt-5 flex-1 space-y-1.5" aria-label="Most recent simulated clicks">
        {items.length === 0 ? (
          <li className="rounded-lg border border-dashed border-white/15 px-3 py-6 text-center text-sm text-white/50">
            {paused ? "Paused. Press play to watch clicks arrive." : "Waiting for the next click"}
          </li>
        ) : null}
        {items.map((item, index) => {
          const Icon = DEVICE_ICONS[item.deviceType];
          return (
            <li
              key={item.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg bg-white/[0.06] px-3 py-2 text-sm",
                index === 0 && !reducedMotion && "animate-in duration-500 fade-in slide-in-from-top-2",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <CountryCode code={item.country} className="bg-white/10 text-white/70 ring-white/10" />
                <span className="truncate">{item.city}</span>
                <Icon className="size-3.5 shrink-0 text-white/45" aria-label={item.deviceType} />
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-white/55">
                <span className="hidden max-w-28 truncate font-mono sm:inline">
                  {item.referrerHost?.replace(/^www\./, "") ?? "direct"}
                </span>
                <span className="w-14 text-right">{secondsAgo(item.at, now)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
