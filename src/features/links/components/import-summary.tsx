"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import { downloadText } from "@/lib/download";
import { buildErrorCsv, errorCsvFilename, type FailedImportRow } from "../import/error-csv";

export interface ImportSummaryProps {
  fileName: string;
  created: number;
  skipped: number;
  failures: FailedImportRow[];
  /** Why the import stopped early (rate limit, cancelled, network), if it did. */
  stoppedReason: string | null;
}

const MAX_LISTED = 50;

export function ImportSummary({ fileName, created, skipped, failures, stoppedReason }: ImportSummaryProps) {
  return (
    <div className="space-y-5" data-testid="import-summary">
      <div role="status" aria-live="polite" className="grid gap-3 sm:grid-cols-3">
        <Stat label="Created" value={created} tone="text-success" />
        <Stat label="Skipped (already imported)" value={skipped} tone="text-foreground" />
        <Stat
          label="Failed"
          value={failures.length}
          tone={failures.length > 0 ? "text-destructive" : "text-foreground"}
        />
      </div>

      {stoppedReason ? (
        <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          The import stopped early: {stoppedReason}. The rows that were not imported are in the failed list,
          so you can download them and try again.
        </p>
      ) : null}

      {failures.length > 0 ? (
        <section aria-labelledby="import-failures" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="import-failures" className="font-medium">
              Rows that were not imported
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadText(buildErrorCsv(failures), errorCsvFilename(fileName), "text/csv;charset=utf-8")
              }
            >
              <Download className="size-4" aria-hidden /> Download failed rows (CSV)
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Fix them in the downloaded file and import it again. Rows that already worked are skipped, so
            nothing is duplicated.
          </p>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Row</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failures.slice(0, MAX_LISTED).map((failure) => (
                  <TableRow key={failure.row} data-testid="import-failure-row">
                    <TableCell className="tabular-nums">{failure.row}</TableCell>
                    <TableCell className="max-w-[16rem] truncate" title={failure.url}>
                      {failure.url || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-destructive">{failure.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {failures.length > MAX_LISTED ? (
            <p className="text-xs text-muted-foreground">
              And {formatNumber(failures.length - MAX_LISTED)} more. The download contains all of them.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-display text-3xl tabular-nums ${tone}`}>{formatNumber(value)}</p>
    </div>
  );
}
