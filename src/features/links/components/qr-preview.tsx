"use client";

import { useMemo } from "react";
import { DEFAULT_QR_BG, DEFAULT_QR_FG, HEX_COLOR_PATTERN } from "@/lib/constants";
import { normalizeFrameText, type QrEcc, type QrFrame } from "@/lib/qr-options";
import { composeQrSvg } from "@/lib/qr-svg";
import { cn } from "@/lib/utils";

/**
 * Client-side QR preview, drawn by the same composer the server uses for SVG downloads and PNG
 * rasterising, so what you see here is what you download. Invalid colours fall back to the defaults
 * while the user is still typing them.
 */
export function QrPreview({
  value,
  fg = DEFAULT_QR_FG,
  bg = DEFAULT_QR_BG,
  ecc = "M",
  frame = "none",
  frameText = null,
  size = 192,
  className,
}: {
  value: string;
  fg?: string;
  bg?: string;
  /** Defaults to `M`, what links had before QR options existed. */
  ecc?: QrEcc;
  frame?: QrFrame;
  frameText?: string | null;
  /** Rendered width in CSS pixels; a framed code is taller. */
  size?: number;
  className?: string;
}) {
  const src = useMemo(() => {
    const svg = composeQrSvg(value, {
      fg: HEX_COLOR_PATTERN.test(fg) ? fg : DEFAULT_QR_FG,
      bg: HEX_COLOR_PATTERN.test(bg) ? bg : DEFAULT_QR_BG,
      ecc,
      frame,
      frameText: normalizeFrameText(frameText),
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [value, fg, bg, ecc, frame, frameText]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated data URL, no optimisation needed
    <img
      src={src}
      width={size}
      alt={`QR code for ${value}`}
      className={cn("h-auto rounded-md border", className)}
      style={{ width: size }}
      data-testid="qr-preview"
    />
  );
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}
