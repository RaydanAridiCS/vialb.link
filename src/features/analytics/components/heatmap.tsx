import type { HeatmapCell } from "@/server/domain/types";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Mix percentages of the primary color for the five intensity steps. */
const STEPS = [16, 34, 54, 76, 100];

function step(clicks: number, max: number): number {
  if (clicks === 0) return -1;
  return Math.min(STEPS.length - 1, Math.floor((clicks / max) * STEPS.length));
}

function stepStyle(index: number) {
  return index < 0
    ? undefined
    : { background: `color-mix(in oklab, var(--primary) ${STEPS[index]}%, var(--card))` };
}

/** Weekday × hour (UTC) heatmap rendered as an accessible table. */
export function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  const grid = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c.clicks]));
  const max = Math.max(1, ...cells.map((c) => c.clicks));
  const peak = cells.reduce<HeatmapCell | null>(
    (best, c) => (!best || c.clicks > best.clicks ? c : best),
    null,
  );
  return (
    <div className="space-y-4">
      <div className="relative overflow-x-auto pb-1">
        <table
          className="w-full min-w-[560px] border-separate border-spacing-[3px] text-[11px]"
          aria-label="Clicks by weekday and hour (UTC)"
        >
          <thead>
            <tr>
              <th className="sr-only">Day</th>
              {Array.from({ length: 24 }, (_, h) => (
                <th
                  key={h}
                  scope="col"
                  className="pb-1 text-left font-mono font-normal text-muted-foreground"
                >
                  {h % 3 === 0 ? String(h).padStart(2, "0") : <span className="sr-only">{h}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, d) => (
              <tr key={day}>
                <th scope="row" className="w-10 pr-2 text-left font-normal text-muted-foreground">
                  {day}
                </th>
                {Array.from({ length: 24 }, (_, h) => {
                  const clicks = grid.get(`${d}:${h}`) ?? 0;
                  const isPeak = peak !== null && peak.clicks > 0 && peak.weekday === d && peak.hour === h;
                  return (
                    <td
                      key={h}
                      title={`${day} ${String(h).padStart(2, "0")}:00 UTC: ${clicks} click${clicks === 1 ? "" : "s"}`}
                      className={cn(
                        "h-6 min-w-4 rounded-[5px] bg-muted transition-transform hover:scale-110",
                        isPeak && "ring-2 ring-foreground ring-offset-1 ring-offset-card",
                      )}
                      style={stepStyle(step(clicks, max))}
                    >
                      <span className="sr-only">{clicks}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>Fewer</span>
        <span className="size-3 rounded-[3px] bg-muted" aria-hidden />
        {STEPS.map((_, i) => (
          <span key={i} className="size-3 rounded-[3px]" style={stepStyle(i)} aria-hidden />
        ))}
        <span>More</span>
        {peak && peak.clicks > 0 ? (
          <span className="ml-3 inline-flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] ring-2 ring-foreground" aria-hidden />
            Peak hour
          </span>
        ) : null}
      </div>
    </div>
  );
}
