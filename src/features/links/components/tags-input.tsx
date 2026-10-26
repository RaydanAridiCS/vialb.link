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
  const [draft, setDraft] = useState("");
  const full = value.length >= LIMITS.tagsPerLinkMax;

  function commit(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag) return setDraft("");
    if (value.includes(tag)) return setDraft("");
    if (!isValidTag(tag) || full) return; // keep the text so the problem stays visible
    onChange([...value, tag]);
    setDraft("");
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
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
        className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        onChange={(e) => {
          const text = e.target.value;
          if (text.includes(",")) {
            const parts = text.split(",");
            for (const part of parts.slice(0, -1)) commit(part);
            setDraft(parts.at(-1) ?? "");
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
  );
}
