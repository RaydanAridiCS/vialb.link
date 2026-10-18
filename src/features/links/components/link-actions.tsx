"use client";

import { QrCode } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import type { LinkDto } from "@/server/services/dto";
import { QrDialog } from "./qr-dialog";

/** Copy + QR buttons for the link detail header. */
export function LinkQuickActions({ link }: { link: LinkDto }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CopyButton value={link.shortUrl} label="Copy link" />
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <QrCode className="size-4" /> QR code
      </Button>
      <QrDialog link={link} open={open} onOpenChange={setOpen} />
    </>
  );
}
