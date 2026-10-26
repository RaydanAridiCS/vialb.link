"use client";

import { PALETTE_KEYS, PALETTES, type PaletteKey } from "@/lib/palettes";
import { cn } from "@/lib/utils";

/**
 * Pick one of the fixed palettes. Native radio buttons underneath, so arrow keys, focus and screen
 * readers behave the way people expect; the swatches are just the visible label.
 */
export function PalettePicker({
  name,
  legend,
  value,
  onChange,
  className,
}: {
  /** Radio group name; must be unique on the page. */
  name: string;
  legend: string;
  value: PaletteKey;
  onChange: (key: PaletteKey) => void;
  className?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm leading-none font-medium">{legend}</legend>
      <div className={cn("grid grid-cols-3 gap-2 sm:grid-cols-6", className)}>
        {PALETTE_KEYS.map((key) => {
          const palette = PALETTES[key];
          return (
            <label key={key} className="relative cursor-pointer">
              <input
                type="radio"
                name={name}
                value={key}
                checked={value === key}
                onChange={() => onChange(key)}
                className="peer sr-only"
              />
              <span
                className="block rounded-lg border-2 border-transparent p-1 ring-1 ring-border peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                style={{ background: palette.bg }}
              >
                <span
                  className="block rounded-md py-2 text-center text-xs font-medium"
                  style={{ background: palette.button, color: palette.buttonFg }}
                >
                  {palette.label}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
