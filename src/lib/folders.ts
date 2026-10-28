import { LIMITS } from "@/lib/constants";

/** Folder names are single-line labels: trimmed, inner whitespace collapsed. `null` when nothing usable is left. */
export function normalizeFolderName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  return name === "" ? null : name;
}

/** Why a (normalized) name cannot be used, or `null`. */
export function folderNameProblem(name: string | null): string | null {
  if (name === null) return "Give the folder a name";
  if (name.length > LIMITS.folderNameMax)
    return `Folder names can be at most ${LIMITS.folderNameMax} characters`;
  if (/[\u0000-\u001f\u007f]/.test(name)) return "Folder names cannot contain control characters";
  return null;
}

/** The dashboard filter value for "links that are in no folder". */
export const NO_FOLDER = "none";
