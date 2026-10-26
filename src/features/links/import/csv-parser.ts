/**
 * Minimal RFC 4180 CSV reader for untrusted files (Bitly/TinyURL exports, Excel, hand-written).
 * It never throws: malformed input is read as leniently as possible and reported through the result.
 */

export const CSV_DELIMITERS = [",", ";", "\t"] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export interface CsvRecord {
  /** Spreadsheet-style row number: the header is row 1, blank rows count. */
  row: number;
  cells: string[];
}

export interface CsvParseResult {
  records: CsvRecord[];
  delimiter: CsvDelimiter;
  /** A quoted cell was never closed, so everything after it was read into that cell. */
  unterminatedQuote: boolean;
}

/** UTF-8 first; Excel's "CSV" on Windows is often windows-1252, which is the fallback. */
export function decodeCsvBytes(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** The delimiter that appears most often in the first record (outside quotes); comma on a tie. */
export function detectDelimiter(text: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === "\n" || ch === "\r")) break;
    else if (!inQuotes && ch in counts) counts[ch as CsvDelimiter] += 1;
  }
  let best: CsvDelimiter = ",";
  for (const delimiter of CSV_DELIMITERS) if (counts[delimiter] > counts[best]) best = delimiter;
  return best;
}

export function parseCsv(input: string, delimiter?: CsvDelimiter): CsvParseResult {
  const text = input.startsWith("﻿") ? input.slice(1) : input;
  const sep = delimiter ?? detectDelimiter(text);
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let rowNumber = 0;

  const endCell = () => {
    cells.push(cell);
    cell = "";
  };
  const endRecord = () => {
    endCell();
    rowNumber += 1;
    if (cells.some((value) => value.trim() !== "")) records.push({ row: rowNumber, cells });
    cells = [];
  };

  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else cell += ch;
      i += 1;
    } else if (ch === '"' && cell === "") {
      inQuotes = true; // a quote only opens a cell at its very start; elsewhere it is literal text
      i += 1;
    } else if (ch === sep) {
      endCell();
      i += 1;
    } else if (ch === "\r" || ch === "\n") {
      endRecord();
      i += ch === "\r" && text.charAt(i + 1) === "\n" ? 2 : 1;
    } else {
      cell += ch;
      i += 1;
    }
  }
  const unterminatedQuote = inQuotes;
  if (cell !== "" || cells.length > 0) endRecord();

  return { records, delimiter: sep, unterminatedQuote };
}
