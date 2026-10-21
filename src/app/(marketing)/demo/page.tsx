import { ArrowRight, CornerDownRight, Megaphone, Mic, UtensilsCrossed } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { AnalyticsView } from "@/features/analytics/components/analytics-view";
import { buildDemoAnalytics, DEMO_RANGES, isDemoRange } from "@/features/demo/generate";
import { LiveFeed } from "@/features/demo/components/live-feed";
import { isScenarioId, SCENARIO_IDS, SCENARIOS, type ScenarioId } from "@/features/demo/scenarios";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Live demo",
  description: "Explore a full analytics report with sample data. No account needed.",
};

const ICONS: Record<ScenarioId, typeof Megaphone> = {
  launch: Megaphone,
  podcast: Mic,
  menu: UtensilsCrossed,
};

export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  const query = await searchParams;
  const scenarioId = isScenarioId(query.scenario) ? query.scenario : "launch";
  const range = isDemoRange(query.range) ? query.range : "30d";
  const includeBots = query.bots === "1";
  const scenario = SCENARIOS[scenarioId];
  const data = buildDemoAnalytics(scenarioId, range, { includeBots });
  const host = new URL(env.SITE_URL).host;

  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-dots [mask-image:linear-gradient(to_bottom,black,transparent)] opacity-50"
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-10 sm:px-6 sm:pt-20">
          <p className="animate-rise inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-xs">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            Sample data, no account needed
          </p>
          <h1
            className="animate-rise mt-5 max-w-3xl font-display text-4xl leading-[1.05] text-balance sm:text-6xl"
            style={{ "--rise-delay": "80ms" } as CSSProperties}
          >
            See what a single link <em className="text-primary">can tell you</em>.
          </h1>
          <p
            className="animate-rise mt-5 max-w-2xl text-lg text-muted-foreground"
            style={{ "--rise-delay": "160ms" } as CSSProperties}
          >
            Pick one of three real-world uses below. Everything on this page is the same report you get for
            your own links, filled with realistic sample traffic.
          </p>

          <nav aria-label="Example links" className="mt-10 grid gap-3 md:grid-cols-3">
            {SCENARIO_IDS.map((id) => {
              const item = SCENARIOS[id];
              const Icon = ICONS[id];
              const active = id === scenarioId;
              return (
                <Link
                  key={id}
                  href={`/demo?scenario=${id}&range=${range}`}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "group relative flex flex-col gap-3 rounded-2xl border bg-card p-5 text-left shadow-paper transition-all outline-none focus-visible:ring-4 focus-visible:ring-ring/25",
                    active
                      ? "border-primary/50 ring-1 ring-primary/40"
                      : "hover:-translate-y-0.5 hover:border-foreground/20",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-xl transition-colors",
                        active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {host}/{item.code}
                    </span>
                  </span>
                  <span className="font-medium">{item.title}</span>
                  <span className="text-sm text-muted-foreground">{item.story}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-labelledby="report-title">
        <div className="mb-8 flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-paper sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0 space-y-2">
            <h2 id="report-title" className="font-display text-2xl leading-tight">
              {scenario.title}
            </h2>
            <div className="flex min-w-0 flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
              <span className="w-fit rounded-md bg-accent px-2 py-0.5 font-mono text-accent-foreground">
                {host}/{scenario.code}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{scenario.destination}</span>
              </span>
            </div>
          </div>
          <Button variant="ink" asChild className="shrink-0">
            <Link href="/sign-up">
              Track your own links <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>

        <AnalyticsView
          data={data}
          range={range}
          includeBots={includeBots}
          rangeOptions={DEMO_RANGES}
          aside={<LiveFeed key={scenarioId} scenarioId={scenarioId} />}
        />
      </section>

      <section className="border-t bg-card/60">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl space-y-3">
            <h2 className="font-display text-2xl leading-tight sm:text-4xl">
              Your links deserve this report.
            </h2>
            <p className="text-muted-foreground">
              Create a free account in seconds. Every link you create gets instant analytics, custom QR codes,
              and privacy protection from its first click.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/sign-up">Create a free account</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/#features">Explore all features</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
