"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ImportFlow } from "./import-flow";

/** "Import CSV" button + the side sheet that walks through pick file -> review -> import -> summary. */
export function ImportLinksSheet() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet
      open={open}
      // Closing mid-import would hide progress while requests are still running; Cancel is explicit.
      onOpenChange={(next) => (next || !busy) && setOpen(next)}
    >
      <SheetTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" aria-hidden /> Import CSV
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Import links from CSV</SheetTitle>
          <SheetDescription>
            Bring links over from Bitly, TinyURL or a spreadsheet. Nothing is created until you review the
            preview.
          </SheetDescription>
        </SheetHeader>
        <ImportFlow onBusyChange={setBusy} onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
