import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { VARIANT_LETTERS, type RoutingRule } from "@/lib/routing";
import type { ConversionRow } from "@/server/services/analytics.service";
import { AnalyticsCard } from "./analytics-view";

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Clicks whose routing label names this variant (`variant:B` or `ios+variant:B`). */
function forLetter<T extends { value: string }>(rows: readonly T[], letter: string): T[] {
  return rows.filter((row) => row.value.split("+").includes(`variant:${letter}`));
}

/**
 * Results of an A/B or percentage split: for each destination its configured share, how many clicks it really
 * got, and (when conversion tracking is on) how many of those converted.
 */
export function VariantsPanel({
  rule,
  routes,
  conversions,
}: {
  rule: RoutingRule;
  routes: { value: string; clicks: number }[];
  conversions?: ConversionRow[];
}) {
  const variants = rule.variants ?? [];
  const clicks = variants.map((_, i) =>
    forLetter(routes, VARIANT_LETTERS[i] ?? "?").reduce((n, r) => n + r.clicks, 0),
  );
  const total = clicks.reduce((n, c) => n + c, 0);
  return (
    <AnalyticsCard
      title="A/B test"
      description="How visitors were divided between the destinations of this link's split."
    >
      <Table data-testid="variants-table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Destination</TableHead>
            <TableHead className="text-right">Planned</TableHead>
            <TableHead className="text-right">Clicks</TableHead>
            <TableHead className="text-right">Actual</TableHead>
            {conversions ? <TableHead className="text-right">Conversions</TableHead> : null}
            {conversions ? <TableHead className="text-right">Rate</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {variants.map((variant, i) => {
            const letter = VARIANT_LETTERS[i] ?? "?";
            const converted = conversions ? forLetter(conversions, letter) : [];
            const trackedClicks = converted.reduce((n, r) => n + r.clicks, 0);
            const wins = converted.reduce((n, r) => n + r.conversions, 0);
            return (
              <TableRow key={letter}>
                <TableCell className="max-w-64">
                  <span className="mr-2 inline-grid size-6 place-items-center rounded-md bg-accent font-mono text-xs text-accent-foreground">
                    {letter}
                  </span>
                  <span title={variant.url}>{variant.label ?? hostOf(variant.url)}</span>
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{variant.weight}%</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {formatNumber(clicks[i] ?? 0)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {total === 0 ? "n/a" : `${Math.round(((clicks[i] ?? 0) / total) * 100)}%`}
                </TableCell>
                {conversions ? (
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {formatNumber(wins)}
                  </TableCell>
                ) : null}
                {conversions ? (
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {trackedClicks === 0 ? "n/a" : `${Math.round((wins / trackedClicks) * 1000) / 10}%`}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="mt-3 text-xs text-muted-foreground">
        Small samples are noisy: a few dozen clicks can differ from the plan just by chance, and a difference
        in conversion rate needs many more clicks than this table shows to mean anything.
      </p>
    </AnalyticsCard>
  );
}
