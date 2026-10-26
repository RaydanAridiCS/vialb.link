import { LIMITS } from "./constants";

/** Letters, numbers, `_` and `-`, starting with a letter or number. Always lowercase. */
export const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;

/** `" #Client Work "` -> `"client-work"`. Returns `""` when nothing usable is left. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^[#\s]+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export function isValidTag(tag: string): boolean {
  return tag.length <= LIMITS.tagMaxLength && TAG_PATTERN.test(tag);
}

/** Normalizes, drops empty entries and duplicates (keeping first-seen order). */
export function normalizeTags(raw: readonly string[]): string[] {
  return [...new Set(raw.map(normalizeTag).filter((tag) => tag !== ""))];
}
