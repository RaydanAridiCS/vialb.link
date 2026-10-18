import { countryFlag, countryName, formatNumber } from "@/lib/format";

/** Horizontal bar list for top-N dimensions (server-renderable, no JS). */
export function BarList({
  items,
  kind = "text",
  empty = "No data for this period",
  unknownLabel = "Unknown",
}: {
  items: { value: string; clicks: number }[];
  kind?: "text" | "country";
  empty?: string;
  /** Display label for missing values (e.g. "Direct" for referrers). */
  unknownLabel?: string;
}) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...items.map((i) => i.clicks), 1);
  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const label =
          kind === "country" && item.value !== "Unknown"
            ? `${countryFlag(item.value)} ${countryName(item.value)}`
            : item.value === "Unknown"
              ? unknownLabel
              : item.value;
        return (
          <li
            key={item.value}
            className="relative flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
              style={{ width: `${(item.clicks / max) * 100}%` }}
            />
            <span className="relative truncate" title={item.value}>
              {label}
            </span>
            <span className="relative text-muted-foreground tabular-nums">{formatNumber(item.clicks)}</span>
          </li>
        );
      })}
    </ul>
  );
}
