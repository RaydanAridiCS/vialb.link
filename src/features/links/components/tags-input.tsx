"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";
import { LIMITS } from "@/lib/constants";
import { isValidTag, normalizeTag } from "@/lib/tags";
import { TagBadge } from "./tag-badge";

/**
 * Chip input: Enter, comma or blur commits what was typed, Backspace on an empty field removes the
 * last chip. `suggestions` (tags already in use) are offered through a native datalist.
 */
export function TagsInput({
  id,
  value,
  onChange,
  suggestions = [],
}: {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
}) {
  const listId = useId();
  const errorId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = value.length >= LIMITS.tagsPerLinkMax;

  /**
   * Adds the given texts in one `onChange` (calling it per tag would each start from the same stale
   * `value`). Returns the first text that was refused, with the reason, so it can stay visible.
   */
  function addTags(raws: string[]): { text: string; reason: string } | null {
    let next = value;
    let rejected: { text: string; reason: string } | null = null;
    for (const raw of raws) {
      const tag = normalizeTag(raw);
      if (!tag || next.includes(tag)) continue;
      let reason: string | null = null;
      if (next.length >= LIMITS.tagsPerLinkMax) {
        reason = `You can add up to ${LIMITS.tagsPerLinkMax} tags.`;
      } else if (!isValidTag(tag)) {
        reason =
          tag.length > LIMITS.tagMaxLength
            ? `Tags can be at most ${LIMITS.tagMaxLength} characters.`
            : "Use only letters, numbers, - and _.";
      }
      if (reason) rejected ??= { text: raw.trim(), reason };
      else next = [...next, tag];
    }
    if (next !== value) onChange(next);
    return rejected;
  }

  function commit(raw: string) {
    // The draft may still hold a comma after a refused paste, so commit every part of it.
    const rejected = addTags(raw.split(","));
    setDraft(rejected?.text ?? "");
    setError(rejected?.reason ?? null);
  }

  return (
    <div className="space-y-1.5">
      <div
        className={`flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border bg-transparent px-2 py-1.5 shadow-xs focus-within:ring-[3px] ${
          error
            ? "border-destructive focus-within:ring-destructive/30"
            : "border-input focus-within:border-ring focus-within:ring-ring/50"
        }`}
      >
        {value.map((tag) => (
          <TagBadge key={tag} tag={tag} className="gap-1.5 pr-1">
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              className="rounded-full p-0.5 hover:bg-foreground/10"
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
              <X className="size-3" aria-hidden />
            </button>
          </TagBadge>
        ))}
        <input
          id={id}
          list={listId}
          value={draft}
          disabled={full}
          maxLength={LIMITS.tagMaxLength + 1}
          placeholder={value.length === 0 ? "promo, client-work…" : full ? "" : "Add a tag"}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => {
            const text = e.target.value;
            setError(null);
            if (text.includes(",")) {
              const parts = text.split(",");
              const rejected = addTags(parts.slice(0, -1));
              const rest = parts.at(-1) ?? "";
              // Keep what follows a refused tag in the box too, so nothing typed or pasted is lost.
              setDraft(rejected ? [rejected.text, rest].filter((part) => part !== "").join(",") : rest);
              setError(rejected?.reason ?? null);
            } else setDraft(text);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // don't submit the link form
              commit(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => commit(draft)}
        />
        <datalist id={listId}>
          {suggestions
            .filter((tag) => !value.includes(tag))
            .map((tag) => (
              <option key={tag} value={tag} />
            ))}
        </datalist>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
