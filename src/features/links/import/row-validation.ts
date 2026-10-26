import { LIMITS } from "@/lib/constants";
import { isValidTag, normalizeTags } from "@/lib/tags";
import { customCodeSchema, destinationUrlSchema } from "../schemas";
import type { ImportField, ImportRowInput } from "./column-mapping";

export interface RowIssue {
  field: ImportField;
  message: string;
}

export interface ValidatedRow {
  row: number;
  url: string;
  title: string;
  code: string;
  /** Normalized, de-duplicated tags (invalid ones are dropped and reported as an issue). */
  tags: string[];
  issues: RowIssue[];
  /** The code already belongs to an identical link of the same owner: importing would skip it. */
  alreadyImported: boolean;
}

function firstMessage(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}): string | null {
  return result.success ? null : (result.error?.issues[0]?.message ?? "Invalid value");
}

/**
 * Per-row checks that need no server: the same schemas the link form uses, plus duplicate codes
 * inside the file. Server-only rules (blocklist, taken codes, Safe Browsing) are checked on import.
 */
export function validateRows(rows: readonly ImportRowInput[]): ValidatedRow[] {
  const firstRowOfCode = new Map<string, number>();
  return rows.map((input) => {
    const issues: RowIssue[] = [];

    const urlProblem = firstMessage(destinationUrlSchema.safeParse(input.url));
    if (urlProblem) issues.push({ field: "url", message: input.url === "" ? "Missing URL" : urlProblem });

    if (input.title.length > LIMITS.titleMax) {
      issues.push({ field: "title", message: `Title is longer than ${LIMITS.titleMax} characters` });
    }

    if (input.code !== "") {
      const codeProblem = firstMessage(customCodeSchema.safeParse(input.code));
      if (codeProblem) issues.push({ field: "code", message: codeProblem });
      else {
        const first = firstRowOfCode.get(input.code);
        if (first === undefined) firstRowOfCode.set(input.code, input.row);
        else issues.push({ field: "code", message: `Same code as row ${first}` });
      }
    }

    const tags = normalizeTags(input.tags);
    const invalid = tags.filter((tag) => !isValidTag(tag));
    if (invalid.length > 0) {
      issues.push({
        field: "tags",
        message: `Invalid tag${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}`,
      });
    }
    const valid = tags.filter(isValidTag);
    if (valid.length > LIMITS.tagsPerLinkMax) {
      issues.push({ field: "tags", message: `More than ${LIMITS.tagsPerLinkMax} tags` });
    }

    return {
      row: input.row,
      url: input.url,
      title: input.title,
      code: input.code,
      tags: valid,
      issues,
      alreadyImported: false,
    };
  });
}

export interface CodeCheck {
  /** Codes owned by someone else or reserved by a deleted link. */
  taken: ReadonlySet<string>;
  /** Codes already pointing at the same destination for this user. */
  existing: ReadonlySet<string>;
}

/** Adds the server's view of the codes: taken ones become issues, identical ones are marked as skipped. */
export function applyCodeCheck(rows: readonly ValidatedRow[], check: CodeCheck): ValidatedRow[] {
  return rows.map((row) => {
    if (row.code === "" || row.issues.some((issue) => issue.field === "code")) return row;
    if (check.existing.has(row.code)) return { ...row, alreadyImported: true };
    if (check.taken.has(row.code)) {
      return { ...row, issues: [...row.issues, { field: "code", message: "Code is already taken" }] };
    }
    return row;
  });
}

export function rowIsReady(row: ValidatedRow): boolean {
  return row.issues.length === 0 && !row.alreadyImported;
}
