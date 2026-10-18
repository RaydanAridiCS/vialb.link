import { Sparkline } from "@/features/analytics/components/kpi-card";
import { buildDemoAnalytics } from "@/features/demo/generate";
import { formatNumber } from "@/lib/format";

/** Brand panel beside the sign-in and sign-up forms on large screens. */
export function AuthAside() {
  // A fixed date keeps this decorative panel static, so auth pages need no request-time data.
  const data = buildDemoAnalytics("podcast", "30d", { now: new Date("2026-06-16T18:00:00Z") });
  const sources = data.dimensions.referrer_host.filter((r) => r.value !== "Unknown").slice(0, 3);
  const total = data.summary.totalClicks;
  return (
    <aside className="relative hidden overflow-hidden bg-ink text-ink-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -bottom-32 size-[30rem] rounded-full bg-primary/30 blur-[120px]"
      />
      <p className="relative max-w-md font-display text-5xl leading-[1.05]">
        Every link is a small experiment. <em className="text-primary">Read the results.</em>
      </p>
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-white/55">Podcast show notes, last 30 days</p>
            <p className="mt-1 font-mono text-4xl font-medium tabular-nums">{formatNumber(total)}</p>
          </div>
          <span className="rounded-full bg-primary/20 px-2 py-0.5 font-mono text-xs text-primary">
            {data.changePct !== null && data.changePct > 0 ? "+" : ""}
            {data.changePct ?? 0}%
          </span>
        </div>
        <Sparkline values={data.timeseries.map((p) => p.clicks)} className="mt-5 h-16" />
        <ul className="mt-5 space-y-2 text-sm">
          {sources.map((source) => (
            <li key={source.value} className="flex items-center justify-between">
              <span className="text-white/75">{source.value.replace(/^www\./, "")}</span>
              <span className="font-mono text-xs text-white/55">
                {Math.round((source.clicks / Math.max(total, 1)) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
