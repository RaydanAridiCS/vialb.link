import { CountryCode } from "@/components/country-code";
import { countryName, formatNumber } from "@/lib/format";

/** Horizontal bar list for top-N dimensions (server-renderable, no JS). */
export function BarList({
  items,
  kind = "text",
  empty = "No data for this period",
  unknownLabel = "Unknown",
  total,
}: {
  items: { value: string; clicks: number }[];
  kind?: "text" | "country";
  empty?: string;
  /** Display label for missing values (e.g. "Direct" for referrers). */
  unknownLabel?: string;
  /** When set, each row also shows its share of this total. */
  total?: number;
}) {
  if (items.length === 0)
    return (
      <p className="grid min-h-40 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">
        {empty}
      </p>
    );
  const max = Math.max(...items.map((i) => i.clicks), 1);
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const unknown = item.value === "Unknown";
        const label = unknown
          ? unknownLabel
          : kind === "country"
            ? countryName(item.value)
            : item.value.replace(/^www\./, "");
        return (
          <li
            key={item.value}
            className="group relative flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-muted/70"
          >
            <span
              aria-hidden
              className="absolute inset-y-1 left-0 rounded-md bg-primary/12 transition-colors group-hover:bg-primary/18 dark:bg-primary/18"
              style={{ width: `${Math.max((item.clicks / max) * 100, 2)}%` }}
            />
            <span className="relative flex min-w-0 items-center gap-2" title={item.value}>
              {kind === "country" && !unknown ? <CountryCode code={item.value} /> : null}
              <span className={unknown ? "truncate text-muted-foreground" : "truncate"}>{label}</span>
            </span>
            <span className="relative flex shrink-0 items-baseline gap-2 font-mono text-xs tabular-nums">
              <span className="text-foreground">{formatNumber(item.clicks)}</span>
              {total ? (
                <span className="w-9 text-right text-muted-foreground">
                  {Math.round((item.clicks / total) * 100)}%
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
