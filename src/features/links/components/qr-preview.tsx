"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Client-side QR preview (live colour changes without a server round-trip). */
export function QrPreview({
  value,
  fg = "#000000",
  bg = "#FFFFFF",
  size = 192,
  className,
}: {
  value: string;
  fg?: string;
  bg?: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const valid = /^#[0-9A-Fa-f]{6}$/;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: valid.test(fg) ? fg : "#000000", light: valid.test(bg) ? bg : "#FFFFFF" },
    })
      .then((url) => !cancelled && setDataUrl(url))
      .catch(() => !cancelled && setDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [value, fg, bg, size]);

  if (!dataUrl)
    return <Skeleton className={cn("rounded-md", className)} style={{ width: size, height: size }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data URL, no optimisation needed
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt={`QR code for ${value}`}
      className={cn("rounded-md border", className)}
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
