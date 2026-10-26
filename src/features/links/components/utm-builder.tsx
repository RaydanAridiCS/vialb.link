"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyUtm, emptyUtm, readUtm, UTM_KEYS, UTM_PRESETS, type UtmKey, type UtmValues } from "../utm";

const FIELD_LABELS: Record<UtmKey, string> = {
  utm_source: "Source",
  utm_medium: "Medium",
  utm_campaign: "Campaign",
  utm_term: "Term",
  utm_content: "Content",
};

const FIELD_PLACEHOLDERS: Record<UtmKey, string> = {
  utm_source: "newsletter",
  utm_medium: "email",
  utm_campaign: "spring-sale",
  utm_term: "running-shoes",
  utm_content: "header-button",
};

/**
 * Edits the UTM parameters of `destinationUrl`. The builder never owns the URL: it writes the
 * result back through `onApply`, so the destination field stays the single source of truth.
 */
export function UtmBuilder({
  destinationUrl,
  onApply,
}: {
  destinationUrl: string;
  onApply: (url: string) => void;
}) {
  const [values, setValues] = useState<UtmValues>(() => readUtm(destinationUrl));
  const canApply = URL.canParse(destinationUrl);
  const result = applyUtm(destinationUrl, values);
  const unchanged = result === destinationUrl;

  function set(key: UtmKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <details className="group rounded-2xl border bg-card shadow-paper">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl px-6 py-5 font-display text-xl outline-none focus-visible:ring-4 focus-visible:ring-ring/25">
        Campaign tracking (UTM)
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 px-6 pb-6">
        <p className="text-sm text-muted-foreground">
          Adds <span className="font-mono">utm_*</span> parameters to the long URL so Google Analytics can
          attribute visits to this campaign.
        </p>
        <div className="flex flex-wrap gap-2">
          {UTM_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setValues({ ...emptyUtm(), ...values, ...preset.values })}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {UTM_KEYS.map((key) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`link-${key}`}>{FIELD_LABELS[key]}</Label>
              <Input
                id={`link-${key}`}
                value={values[key]}
                placeholder={FIELD_PLACEHOLDERS[key]}
                autoComplete="off"
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Resulting URL</p>
          <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all" data-testid="utm-preview">
            {canApply ? result : "Enter a valid long URL above to preview."}
          </p>
        </div>
        <Button type="button" size="sm" disabled={!canApply || unchanged} onClick={() => onApply(result)}>
          Apply to long URL
        </Button>
      </div>
    </details>
  );
}
