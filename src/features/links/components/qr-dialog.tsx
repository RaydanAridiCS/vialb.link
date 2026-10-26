"use client";

import { Download, Save } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HEX_COLOR_PATTERN } from "@/lib/constants";
import { normalizeFrameText, qrWarnings } from "@/lib/qr-options";
import type { LinkDto } from "@/server/services/dto";
import { saveQrOptionsAction } from "../actions";
import { QrControls, type QrControlValues } from "./qr-controls";
import { QrPreview } from "./qr-preview";

type QrLink = Pick<
  LinkDto,
  "id" | "code" | "shortUrl" | "qrFgColor" | "qrBgColor" | "qrEcc" | "qrFrame" | "qrFrameText"
>;

export function QrDialog({
  link,
  open,
  onOpenChange,
}: {
  link: QrLink | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        {link ? <QrDialogBody key={link.id} link={link} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function QrDialogBody({ link, onDone }: { link: QrLink; onDone: () => void }) {
  const [design, setDesign] = useState<QrControlValues>({
    fg: link.qrFgColor,
    bg: link.qrBgColor,
    ecc: link.qrEcc,
    frame: link.qrFrame,
    frameText: link.qrFrameText ?? "",
  });
  const valid = HEX_COLOR_PATTERN.test(design.fg) && HEX_COLOR_PATTERN.test(design.bg);
  const blocked = !valid || qrWarnings(design.fg, design.bg).some((w) => w.severity === "block");
  const save = useAction(saveQrOptionsAction, {
    onSuccess: () => {
      toast.success("QR design saved");
      onDone();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Could not save the QR design"),
  });

  /** The same options the preview uses, so a download matches what is on screen. */
  const href = (format: "png" | "svg", size: number) => {
    const params = new URLSearchParams({
      format,
      fg: design.fg,
      bg: design.bg,
      ecc: design.ecc,
      frame: design.frame,
      size: String(size),
      download: "1",
    });
    const text = normalizeFrameText(design.frameText);
    if (design.frame === "badge" && text) params.set("frameText", text);
    return `/api/app/links/${link.id}/qr?${params}`;
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>QR code for /{link.code}</DialogTitle>
        <DialogDescription className="truncate">{link.shortUrl}</DialogDescription>
      </DialogHeader>
      <div className="flex justify-center py-2">
        <QrPreview
          value={link.shortUrl}
          fg={valid ? design.fg : link.qrFgColor}
          bg={valid ? design.bg : link.qrBgColor}
          ecc={design.ecc}
          frame={design.frame}
          frameText={design.frameText}
          size={220}
        />
      </div>
      <QrControls idPrefix="qr" value={design} onChange={(patch) => setDesign((c) => ({ ...c, ...patch }))} />
      <DialogFooter className="gap-2 sm:flex-col sm:items-stretch">
        <div className="flex flex-wrap justify-end gap-2">
          <DownloadButton href={href("svg", 1024)} disabled={blocked} variant="outline">
            SVG
          </DownloadButton>
          <DownloadButton href={href("png", 1024)} disabled={blocked} variant="outline">
            PNG
          </DownloadButton>
          <DownloadButton href={href("png", 2048)} disabled={blocked}>
            High-res PNG
          </DownloadButton>
        </div>
        <Button
          variant="ghost"
          className="self-start"
          disabled={blocked || save.isPending}
          onClick={() =>
            save.execute({
              id: link.id,
              qrFgColor: design.fg,
              qrBgColor: design.bg,
              qrEcc: design.ecc,
              qrFrame: design.frame,
              qrFrameText: design.frame === "badge" ? design.frameText : "",
            })
          }
        >
          <Save className="size-4" /> Save as default
        </Button>
      </DialogFooter>
    </>
  );
}

/** A download link; while the design cannot be scanned it is a real disabled button, not a clickable anchor. */
function DownloadButton({
  href,
  disabled,
  variant,
  children,
}: {
  href: string;
  disabled: boolean;
  variant?: "outline";
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant={variant} disabled>
        <Download className="size-4" /> {children}
      </Button>
    );
  }
  return (
    <Button variant={variant} asChild>
      <a href={href} download>
        <Download className="size-4" /> {children}
      </a>
    </Button>
  );
}
