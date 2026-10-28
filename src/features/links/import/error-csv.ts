import { csvRow } from "@/lib/csv";

export interface FailedImportRow {
  row: number;
  url: string;
  title: string;
  code: string;
  tags: readonly string[];
  folder: string;
  reason: string;
}

/**
 * CSV of the rows that did not import, in the same column names the importer reads, so it can be
 * fixed and uploaded again. Every cell goes through `csvField` (formula-injection guard); the
 * importer strips that guard on the way back in.
 */
export function buildErrorCsv(failures: readonly FailedImportRow[]): string {
  const header = csvRow(["url", "title", "custom_code", "tags", "folder", "error", "original_row"]);
  const lines = failures.map((f) =>
    csvRow([f.url, f.title, f.code, f.tags.join(" "), f.folder, f.reason, f.row]),
  );
  return header + lines.join("");
}

/** `"My links (1).csv"` -> `"import-errors-My-links-1.csv"`; never contains path characters. */
export function errorCsvFilename(uploadedName: string): string {
  const base = uploadedName
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `import-errors${base ? `-${base}` : ""}.csv`;
}
