"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { HEX_COLOR_PATTERN } from "@/lib/constants";
import {
  DEFAULT_QR_FRAME_TEXT,
  QR_ECC_LABELS,
  QR_ECC_LEVELS,
  QR_FRAME_LABELS,
  QR_FRAME_TEXT_MAX,
  QR_FRAMES,
  qrWarnings,
  type QrEcc,
  type QrFrame,
} from "@/lib/qr-options";

export interface QrControlValues {
  fg: string;
  bg: string;
  ecc: QrEcc;
  frame: QrFrame;
  frameText: string;
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * The QR design controls shared by the link form and the QR dialog: colours, error correction,
 * frame and badge text, plus live scannability warnings. Controlled; `onChange` gets the changed field only.
 */
export function QrControls({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: QrControlValues;
  onChange: (patch: Partial<QrControlValues>) => void;
}) {
  const colorsValid = HEX_COLOR_PATTERN.test(value.fg) && HEX_COLOR_PATTERN.test(value.bg);
  const warnings = colorsValid ? qrWarnings(value.fg, value.bg) : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["Foreground", "fg"],
            ["Background", "bg"],
          ] as const
        ).map(([label, key]) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label={`${label} colour picker`}
                value={HEX_COLOR_PATTERN.test(value[key]) ? value[key] : "#000000"}
                onChange={(e) => onChange({ [key]: e.target.value.toUpperCase() })}
                className="h-9 w-10 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <Input
                id={`${idPrefix}-${key}`}
                className="font-mono"
                value={value[key]}
                maxLength={7}
                onChange={(e) => onChange({ [key]: e.target.value })}
                aria-invalid={!HEX_COLOR_PATTERN.test(value[key])}
              />
            </div>
          </div>
        ))}
      </div>

      {warnings.map((warning) => (
        <p
          key={warning.code}
          role={warning.severity === "block" ? "alert" : "status"}
          className={warning.severity === "block" ? "text-sm text-destructive" : "text-sm text-warning"}
        >
          {warning.message}
        </p>
      ))}

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-ecc`}>Error correction</Label>
        <select
          id={`${idPrefix}-ecc`}
          className={selectClass}
          value={value.ecc}
          onChange={(e) => onChange({ ecc: e.target.value as QrEcc })}
        >
          {QR_ECC_LEVELS.map((level) => (
            <option key={level} value={level}>
              {QR_ECC_LABELS[level]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Higher levels keep scanning when the code is dirty or partly covered, but look denser.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm leading-none font-medium">Frame</legend>
        <RadioGroup
          value={value.frame}
          aria-label="Frame"
          onValueChange={(next) => onChange({ frame: next as QrFrame })}
          className="grid gap-2"
        >
          {QR_FRAMES.map((frame) => (
            <div key={frame} className="flex items-center gap-2">
              <RadioGroupItem id={`${idPrefix}-frame-${frame}`} value={frame} />
              <Label htmlFor={`${idPrefix}-frame-${frame}`} className="font-normal">
                {QR_FRAME_LABELS[frame]}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      {value.frame === "badge" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-frame-text`}>Badge text</Label>
          <Input
            id={`${idPrefix}-frame-text`}
            value={value.frameText}
            maxLength={QR_FRAME_TEXT_MAX}
            placeholder={DEFAULT_QR_FRAME_TEXT}
            autoComplete="off"
            onChange={(e) => onChange({ frameText: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Up to {QR_FRAME_TEXT_MAX} characters. Leave empty for &ldquo;{DEFAULT_QR_FRAME_TEXT}&rdquo;.
          </p>
        </div>
      ) : null}
    </div>
  );
}
