import { normalizeTag } from "@/lib/tags";
import type { CsvRecord } from "./csv-parser";

export const IMPORT_FIELDS = ["url", "title", "code", "tags", "folder"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  url: "Destination URL",
  title: "Title",
  code: "Custom code",
  tags: "Tags",
  folder: "Folder",
};

/** Header names (normalized, see `normalizeHeader`) that identify each field. */
export const FIELD_ALIASES: Record<ImportField, readonly string[]> = {
  url: ["url", "destination", "destination_url", "long_url", "longurl", "link", "target", "target_url"],
  title: ["title", "name", "label"],
  code: ["custom_code", "code", "short_code", "slug", "back_half", "backhalf", "keyword", "alias"],
  tags: ["tags", "tag", "labels", "categories", "category"],
  folder: ["folder", "folder_name", "group", "collection"],
};

/** Column index (0-based) per field, or `null` when the file has no such column. */
export type ColumnMapping = Record<ImportField, number | null>;

export interface ImportRowInput {
  /** Spreadsheet-style row number in the uploaded file. */
  row: number;
  url: string;
  title: string;
  code: string;
  /** Tags from the cell, already split and lowercased; validity is checked in `row-validation.ts`. */
  tags: string[];
  /** Folder name from the cell; created in the workspace when new. */
  folder: string;
}

/** `" Long URL "` / `"Back-Half"` / `"long.url"` -> `"long_url"` / `"back_half"` / `"long_url"`. */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s.\-]+/g, "_");
}

/** Undoes the leading `'` our own CSV export adds in front of `= + - @` (formula-injection guard). */
export function cleanCell(value: string): string {
  return value.replace(/^'(?=[=+\-@\t\r])/, "").trim();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Does the first record look like a header row (known column names) rather than data? */
export function detectHeader(first: readonly string[] | undefined): boolean {
  if (!first) return true;
  const known = new Set(Object.values(FIELD_ALIASES).flat());
  if (first.some((cell) => known.has(normalizeHeader(cell)))) return true;
  return !first.some(isHttpUrl);
}

export function emptyMapping(): ColumnMapping {
  return { url: null, title: null, code: null, tags: null, folder: null };
}

/** Picks, per field, the first column whose header is a known alias. Each column is used once. */
export function detectMapping(headers: readonly string[]): ColumnMapping {
  const mapping = emptyMapping();
  const used = new Set<number>();
  const normalized = headers.map(normalizeHeader);
  for (const field of IMPORT_FIELDS) {
    const index = normalized.findIndex((header, i) => !used.has(i) && FIELD_ALIASES[field].includes(header));
    if (index !== -1) {
      mapping[field] = index;
      used.add(index);
    }
  }
  return mapping;
}

/** Mapping for a file without a header row: the first column that holds a URL is the destination. */
export function guessHeaderlessMapping(first: readonly string[] | undefined): ColumnMapping {
  const mapping = emptyMapping();
  const index = first?.findIndex(isHttpUrl) ?? -1;
  if (index !== -1) mapping.url = index;
  return mapping;
}

/** Tags in one cell may be separated by commas, semicolons, pipes or spaces. */
export function splitTagCell(cell: string): string[] {
  return cell
    .split(/[,;|\s]+/)
    .map(normalizeTag)
    .filter((tag) => tag !== "");
}

/** Turns CSV records into import rows using the chosen column mapping. */
export function extractRows(
  records: readonly CsvRecord[],
  mapping: ColumnMapping,
  hasHeader: boolean,
): ImportRowInput[] {
  const dataRecords = hasHeader ? records.slice(1) : records;
  const read = (cells: readonly string[], index: number | null) =>
    index === null ? "" : cleanCell(cells[index] ?? "");
  return dataRecords.map(({ row, cells }) => ({
    row,
    url: read(cells, mapping.url),
    title: read(cells, mapping.title),
    code: read(cells, mapping.code),
    tags: splitTagCell(read(cells, mapping.tags)),
    folder: read(cells, mapping.folder),
  }));
}
