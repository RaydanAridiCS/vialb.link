"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LIMITS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import {
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  type ColumnMapping,
  type ImportField,
} from "../import/column-mapping";
import { rowIsReady, type ValidatedRow } from "../import/row-validation";

export interface ImportReviewProps {
  headers: string[];
  hasHeader: boolean;
  onHasHeaderChange: (value: boolean) => void;
  mapping: ColumnMapping;
  onMappingChange: (field: ImportField, column: number | null) => void;
  rows: ValidatedRow[];
  /** Waiting for the server to say which codes are already taken. */
  checking: boolean;
  checkFailed: boolean;
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ImportReview({
  headers,
  hasHeader,
  onHasHeaderChange,
  mapping,
  onMappingChange,
  rows,
  checking,
  checkFailed,
}: ImportReviewProps) {
  const [onlyProblems, setOnlyProblems] = useState(false);

  const ready = rows.filter(rowIsReady).length;
  const skipped = rows.filter((row) => row.alreadyImported).length;
  const problems = rows.filter((row) => row.issues.length > 0).length;
  const shown = (onlyProblems ? rows.filter((row) => row.issues.length > 0) : rows).slice(
    0,
    LIMITS.importPreviewRows,
  );
  const hidden = (onlyProblems ? problems : rows.length) - shown.length;

  return (
    <div className="space-y-6">
      <section aria-labelledby="import-columns" className="space-y-3">
        <h3 id="import-columns" className="font-medium">
          Columns
        </h3>
        <div className="flex items-center gap-2">
          <Checkbox
            id="import-has-header"
            checked={hasHeader}
            onCheckedChange={(value) => onHasHeaderChange(value === true)}
          />
          <Label htmlFor="import-has-header">First row contains column names</Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {IMPORT_FIELDS.map((field) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`import-map-${field}`}>
                {IMPORT_FIELD_LABELS[field]}
                {field === "url" ? " (required)" : ""}
              </Label>
              <select
                id={`import-map-${field}`}
                className={selectClass}
                value={mapping[field] ?? ""}
                onChange={(e) =>
                  onMappingChange(field, e.target.value === "" ? null : Number(e.target.value))
                }
              >
                <option value="">{field === "url" ? "Choose a column…" : "Not in this file"}</option>
                {headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header.trim() || `Column ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="import-preview" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="import-preview" className="font-medium">
            Preview
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <Checkbox
              id="import-only-problems"
              checked={onlyProblems}
              onCheckedChange={(value) => setOnlyProblems(value === true)}
            />
            <Label htmlFor="import-only-problems" className="font-normal">
              Only rows with problems
            </Label>
          </div>
        </div>

        <p className="text-sm text-muted-foreground" data-testid="import-summary-line">
          {formatNumber(rows.length)} rows: <span className="text-success">{formatNumber(ready)} ready</span>
          {skipped > 0 ? `, ${formatNumber(skipped)} already imported (will be skipped)` : ""}
          {problems > 0 ? (
            <>
              , <span className="text-destructive">{formatNumber(problems)} with problems</span> (these will
              not be imported)
            </>
          ) : null}
          {checking ? ". Checking codes…" : ""}
        </p>
        {checkFailed ? (
          <p role="status" className="text-sm text-warning">
            Could not check custom codes against your existing links. Taken codes will be reported while
            importing.
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Row</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Folder</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                    {onlyProblems ? "No problems found." : "No rows."}
                  </TableCell>
                </TableRow>
              ) : (
                shown.map((row) => (
                  <TableRow key={row.row} data-testid="import-preview-row">
                    <TableCell className="tabular-nums">{row.row}</TableCell>
                    <TableCell className="max-w-[16rem] truncate" title={row.url}>
                      {row.url || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.code || "—"}</TableCell>
                    <TableCell className="text-xs">{row.tags.join(", ") || "—"}</TableCell>
                    <TableCell className="text-xs">{row.folder || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {row.issues.length > 0 ? (
                        <ul className="space-y-0.5 text-destructive">
                          {row.issues.map((issue) => (
                            <li key={issue.field + issue.message}>{issue.message}</li>
                          ))}
                        </ul>
                      ) : row.alreadyImported ? (
                        <span className="text-muted-foreground">Already imported</span>
                      ) : (
                        <span className="text-success">Ready</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {hidden > 0 ? (
          <p className="text-xs text-muted-foreground">
            And {formatNumber(hidden)} more rows. Every row is checked, not only the ones shown.
          </p>
        ) : null}
      </section>
    </div>
  );
}
