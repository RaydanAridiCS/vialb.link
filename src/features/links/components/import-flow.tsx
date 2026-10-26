"use client";

import { FileSpreadsheet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LIMITS } from "@/lib/constants";
import { downloadText } from "@/lib/download";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ImportRowResult } from "@/server/services/link.service";
import { checkImportCodesAction, importLinksAction } from "../actions";
import {
  detectHeader,
  detectMapping,
  emptyMapping,
  extractRows,
  guessHeaderlessMapping,
  type ColumnMapping,
  type ImportField,
} from "../import/column-mapping";
import { decodeCsvBytes, parseCsv, type CsvRecord } from "../import/csv-parser";
import type { FailedImportRow } from "../import/error-csv";
import {
  applyCodeCheck,
  rowIsReady,
  validateRows,
  type CodeCheck,
  type ValidatedRow,
} from "../import/row-validation";
import { ImportReview } from "./import-review";
import { ImportSummary } from "./import-summary";

const SAMPLE_CSV = [
  "url,title,custom_code,tags",
  "https://example.com/spring-menu,Spring menu,spring-menu,promo menus",
  "https://example.com/newsletter/42,Newsletter #42,,newsletter",
  "",
].join("\r\n");

type Stage = "pick" | "review" | "importing" | "done";

interface Loaded {
  fileName: string;
  records: CsvRecord[];
}

interface Outcome {
  created: number;
  skipped: number;
  failures: FailedImportRow[];
  stoppedReason: string | null;
}

function analyse(records: readonly CsvRecord[], mapping: ColumnMapping, hasHeader: boolean): ValidatedRow[] {
  return validateRows(extractRows(records, mapping, hasHeader));
}

function toFailure(row: ValidatedRow, reason: string): FailedImportRow {
  return { row: row.row, url: row.url, title: row.title, code: row.code, tags: row.tags, reason };
}

export function ImportFlow({
  onBusyChange,
  onClose,
}: {
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const importAction = useAction(importLinksAction);
  const checkAction = useAction(checkImportCodesAction);

  const [stage, setStageState] = useState<Stage>("pick");
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping());
  const [codeCheck, setCodeCheck] = useState<CodeCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const checkToken = useRef(0);
  const cancelled = useRef(false);

  const validated = useMemo(
    () => (loaded ? analyse(loaded.records, mapping, hasHeader) : []),
    [loaded, mapping, hasHeader],
  );
  const rows = useMemo(
    () => (codeCheck ? applyCodeCheck(validated, codeCheck) : validated),
    [validated, codeCheck],
  );
  const ready = rows.filter(rowIsReady);

  const firstCells = loaded?.records[0]?.cells ?? [];
  const columnCount = loaded ? Math.max(0, ...loaded.records.map((record) => record.cells.length)) : 0;
  const columnLabels = hasHeader
    ? Array.from({ length: columnCount }, (_, i) => firstCells[i] ?? "")
    : Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);

  function setStage(next: Stage) {
    setStageState(next);
    onBusyChange(next === "importing");
  }

  /** Asks the server which custom codes are already in use, ignoring answers to outdated questions. */
  async function refreshCodeCheck(current: ValidatedRow[]) {
    const token = ++checkToken.current;
    const items = current
      .filter((row) => row.code !== "" && !row.issues.some((i) => i.field === "code" || i.field === "url"))
      .map((row) => ({ code: row.code, url: row.url }));
    setCodeCheck(null);
    setCheckFailed(false);
    if (items.length === 0) return setChecking(false);
    setChecking(true);
    try {
      const result = await checkAction.executeAsync({ items });
      if (token !== checkToken.current) return;
      if (result?.data) {
        setCodeCheck({ taken: new Set(result.data.taken), existing: new Set(result.data.existing) });
      } else setCheckFailed(true);
    } catch {
      if (token === checkToken.current) setCheckFailed(true);
    }
    if (token === checkToken.current) setChecking(false);
  }

  async function handleFile(file: File) {
    setFileError(null);
    if (file.size > LIMITS.importMaxBytes) {
      return setFileError(
        `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${LIMITS.importMaxBytes / 1024 / 1024} MB.`,
      );
    }
    if (!/\.(csv|txt)$/i.test(file.name) && !/^(text\/|application\/vnd\.ms-excel)/.test(file.type)) {
      return setFileError(
        "Please choose a .csv file (exported from Bitly, TinyURL, Excel or Google Sheets).",
      );
    }

    const { records, unterminatedQuote } = parseCsv(decodeCsvBytes(await file.arrayBuffer()));
    if (records.length === 0) return setFileError("This file is empty.");
    if (unterminatedQuote) {
      return setFileError("This file has a quoted cell that never closes. Check the quotes and try again.");
    }

    const header = detectHeader(records[0]?.cells);
    const dataRows = records.length - (header ? 1 : 0);
    if (dataRows === 0) return setFileError("This file only has a header row and no links.");
    if (dataRows > LIMITS.importMaxRows) {
      return setFileError(
        `This file has ${formatNumber(dataRows)} rows. The limit is ${formatNumber(LIMITS.importMaxRows)} per import, so split it into smaller files.`,
      );
    }

    const nextMapping = header
      ? detectMapping(records[0]?.cells ?? [])
      : guessHeaderlessMapping(records[0]?.cells);
    setLoaded({ fileName: file.name, records });
    setHasHeader(header);
    setMapping(nextMapping);
    setStage("review");
    void refreshCodeCheck(analyse(records, nextMapping, header));
  }

  function changeHeader(next: boolean) {
    if (!loaded) return;
    const nextMapping = next ? detectMapping(firstCells) : guessHeaderlessMapping(firstCells);
    setHasHeader(next);
    setMapping(nextMapping);
    void refreshCodeCheck(analyse(loaded.records, nextMapping, next));
  }

  function changeMapping(field: ImportField, column: number | null) {
    if (!loaded) return;
    const next = { ...mapping, [field]: column };
    setMapping(next);
    void refreshCodeCheck(analyse(loaded.records, next, hasHeader));
  }

  function reset() {
    checkToken.current += 1;
    setLoaded(null);
    setCodeCheck(null);
    setChecking(false);
    setCheckFailed(false);
    setOutcome(null);
    setFileError(null);
    setStage("pick");
  }

  async function runImport() {
    const toSend = ready;
    cancelled.current = false;
    setProgress({ done: 0, total: toSend.length });
    setStage("importing");

    const results: ImportRowResult[] = [];
    let stoppedReason: string | null = null;
    for (let start = 0; start < toSend.length; start += LIMITS.importBatchSize) {
      if (cancelled.current) {
        stoppedReason = "you cancelled it";
        break;
      }
      const chunk = toSend.slice(start, start + LIMITS.importBatchSize);
      try {
        const batch = await importBatch(chunk);
        if (typeof batch === "string") {
          stoppedReason = batch;
          break;
        }
        results.push(...batch);
        setProgress({ done: results.length, total: toSend.length });
      } catch {
        stoppedReason = "the connection to the server was lost";
        break;
      }
    }

    const byRow = new Map(rows.map((row) => [row.row, row]));
    const failures: FailedImportRow[] = rows
      .filter((row) => row.issues.length > 0)
      .map((row) => toFailure(row, row.issues.map((issue) => issue.message).join("; ")));
    let created = 0;
    let skipped = rows.filter((row) => row.alreadyImported).length;
    for (const result of results) {
      if (result.status === "created") created += 1;
      else if (result.status === "skipped") skipped += 1;
      else {
        const row = byRow.get(result.row);
        if (row) failures.push(toFailure(row, result.reason));
      }
    }
    for (const row of toSend.slice(results.length)) {
      failures.push(toFailure(row, `Not imported because ${stoppedReason ?? "the import stopped"}`));
    }
    failures.sort((a, b) => a.row - b.row);

    setOutcome({ created, skipped, failures, stoppedReason });
    setStage("done");
    router.refresh();
  }

  /** One server call. Returns the row results, or the reason the whole batch was refused. */
  async function importBatch(chunk: ValidatedRow[]) {
    const response = await importAction.executeAsync({
      rows: chunk.map((row) => ({
        row: row.row,
        url: row.url,
        title: row.title,
        code: row.code,
        tags: row.tags,
      })),
    });
    if (response?.data) return response.data.results;
    if (response?.serverError) return response.serverError;
    return "the request was rejected";
  }

  if (stage === "pick") {
    return (
      <div className="space-y-5 px-4 pb-6">
        <div
          role="group"
          aria-label="Drop zone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
            dragging ? "border-primary bg-accent/60" : "border-input",
          )}
        >
          <FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">Drag a CSV file here</p>
          <p className="text-sm text-muted-foreground">or</p>
          <Button type="button" onClick={() => inputRef.current?.click()}>
            Choose a file
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            aria-label="CSV file"
            tabIndex={-1}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // choosing the same file again must still fire onChange
              if (file) void handleFile(file);
            }}
          />
        </div>

        {fileError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          >
            {fileError}
          </p>
        ) : null}

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Up to {formatNumber(LIMITS.importMaxRows)} rows and {LIMITS.importMaxBytes / 1024 / 1024} MB per
            file. We look for these columns by name:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-mono text-foreground">url</span> (required), also{" "}
              <em>destination, long_url, link, target</em>
            </li>
            <li>
              <span className="font-mono text-foreground">title</span>
            </li>
            <li>
              <span className="font-mono text-foreground">custom_code</span>, also{" "}
              <em>code, slug, back_half, keyword</em>
            </li>
            <li>
              <span className="font-mono text-foreground">tags</span>, separated by commas, semicolons or
              spaces
            </li>
          </ul>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => downloadText(SAMPLE_CSV, "vialb-import-sample.csv", "text/csv;charset=utf-8")}
          >
            Download a sample file
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "review" && loaded) {
    const urlMissing = mapping.url === null;
    return (
      <div className="space-y-6 px-4 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p>
            <span className="font-medium">{loaded.fileName}</span>
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Choose a different file
          </Button>
        </div>
        <ImportReview
          headers={columnLabels}
          hasHeader={hasHeader}
          onHasHeaderChange={changeHeader}
          mapping={mapping}
          onMappingChange={changeMapping}
          rows={rows}
          checking={checking}
          checkFailed={checkFailed}
        />
        {urlMissing ? (
          <p role="alert" className="text-sm text-destructive">
            Choose which column holds the destination URL.
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={urlMissing || checking || ready.length === 0}
            onClick={() => void runImport()}
          >
            Import {formatNumber(ready.length)} link{ready.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "importing") {
    const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
    return (
      <div className="space-y-4 px-4 pb-6">
        <Progress value={percent} aria-label="Import progress" />
        <p role="status" aria-live="polite" className="text-sm">
          Importing… {formatNumber(progress.done)} of {formatNumber(progress.total)} rows
        </p>
        <Button type="button" variant="outline" onClick={() => (cancelled.current = true)}>
          Cancel import
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 pb-6">
      {outcome && loaded ? <ImportSummary fileName={loaded.fileName} {...outcome} /> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={reset}>
          Import another file
        </Button>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
