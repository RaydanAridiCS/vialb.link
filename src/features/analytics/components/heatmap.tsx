import type { HeatmapCell } from "@/server/domain/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday × hour (UTC) heatmap rendered as an accessible table. */
export function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  const grid = new Map(cells.map((c) => [`${c.weekday}:${c.hour}`, c.clicks]));
  const max = Math.max(1, ...cells.map((c) => c.clicks));
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-separate border-spacing-0.5 text-xs"
        aria-label="Clicks by weekday and hour (UTC)"
      >
        <thead>
          <tr>
            <th className="sr-only">Day</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} scope="col" className="font-normal text-muted-foreground">
                {h % 3 === 0 ? h : <span className="sr-only">{h}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day, d) => (
            <tr key={day}>
              <th scope="row" className="pr-1 text-left font-normal text-muted-foreground">
                {day}
              </th>
              {Array.from({ length: 24 }, (_, h) => {
                const clicks = grid.get(`${d}:${h}`) ?? 0;
                return (
                  <td
                    key={h}
                    title={`${day} ${h}:00 UTC — ${clicks} click${clicks === 1 ? "" : "s"}`}
                    className="h-5 min-w-4 rounded-sm bg-muted"
                    style={
                      clicks
                        ? {
                            background: `color-mix(in oklab, var(--chart-1) ${15 + (clicks / max) * 85}%, transparent)`,
                          }
                        : undefined
                    }
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
  );
}
