import type { QrOptions } from "@/server/services/qr.service";

/**
 * Design overrides from a QR route's query string (`?fg=&bg=&ecc=&frame=&frameText=`). Values are
 * passed through as text; `QrService.render` validates them. Anything not given falls back to the
 * link's saved design.
 */
export function qrOptionsFromQuery(params: URLSearchParams, defaultSize?: number): QrOptions {
  return {
    fg: params.get("fg") ?? undefined,
    bg: params.get("bg") ?? undefined,
    size: params.has("size") ? Number(params.get("size")) : defaultSize,
    ecc: params.get("ecc") ?? undefined,
    frame: params.get("frame") ?? undefined,
    frameText: params.get("frameText") ?? undefined,
  };
}
