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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HEX_COLOR_PATTERN } from "@/lib/constants";
import type { LinkDto } from "@/server/services/dto";
import { saveQrColorsAction } from "../actions";
import { QrPreview } from "./qr-preview";

type QrLink = Pick<LinkDto, "id" | "code" | "shortUrl" | "qrFgColor" | "qrBgColor">;

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
      <DialogContent className="sm:max-w-md">
        {link ? <QrDialogBody key={link.id} link={link} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function QrDialogBody({ link, onDone }: { link: QrLink; onDone: () => void }) {
  const [fg, setFg] = useState(link.qrFgColor);
  const [bg, setBg] = useState(link.qrBgColor);
  const valid = HEX_COLOR_PATTERN.test(fg) && HEX_COLOR_PATTERN.test(bg);
  const save = useAction(saveQrColorsAction, {
    onSuccess: () => {
      toast.success("QR colours saved");
      onDone();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Could not save colours"),
  });

  const href = (format: "png" | "svg") =>
    `/api/app/links/${link.id}/qr?${new URLSearchParams({ format, fg, bg, size: "1024", download: "1" })}`;

  return (
    <>
      <DialogHeader>
        <DialogTitle>QR code for /{link.code}</DialogTitle>
        <DialogDescription className="truncate">{link.shortUrl}</DialogDescription>
      </DialogHeader>
      <div className="flex justify-center py-2">
        <QrPreview
          value={link.shortUrl}
          fg={valid ? fg : link.qrFgColor}
          bg={valid ? bg : link.qrBgColor}
          size={220}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["Foreground", fg, setFg],
            ["Background", bg, setBg],
          ] as const
        ).map(([label, value, set]) => (
          <div key={label} className="space-y-1.5">
            <Label htmlFor={`qr-${label}`}>{label}</Label>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label={`${label} colour picker`}
                value={HEX_COLOR_PATTERN.test(value) ? value : "#000000"}
                onChange={(e) => set(e.target.value.toUpperCase())}
                className="h-9 w-10 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <Input
                id={`qr-${label}`}
                className="font-mono"
                value={value}
                maxLength={7}
                onChange={(e) => set(e.target.value)}
                aria-invalid={!HEX_COLOR_PATTERN.test(value)}
              />
            </div>
          </div>
        ))}
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        <Button
          variant="ghost"
          disabled={!valid || save.isPending}
          onClick={() => save.execute({ id: link.id, qrFgColor: fg, qrBgColor: bg })}
        >
          <Save className="size-4" /> Save as default
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" asChild disabled={!valid}>
            <a href={href("svg")} download>
              <Download className="size-4" /> SVG
            </a>
          </Button>
          <Button asChild disabled={!valid}>
            <a href={href("png")} download>
              <Download className="size-4" /> PNG
            </a>
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
