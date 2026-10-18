"use client";

import Link from "next/link";
import { useEffect } from "react";
import { LogoMark } from "@/components/icons";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <main id="main" className="relative flex min-h-svh flex-1 items-center justify-center px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] opacity-60"
      />
      <div className="relative max-w-md space-y-5 text-center">
        <LogoMark className="mx-auto size-10" />
        <p aria-hidden className="font-display text-[6rem] leading-none text-primary">
          500
        </p>
        <h1 className="font-display text-3xl">Something broke on our side</h1>
        <p className="text-muted-foreground">
          The error has been logged. Try again, and if it keeps happening, let the person who runs this
          instance know.
        </p>
        {digest ? <p className="font-mono text-xs text-muted-foreground">Reference: {digest}</p> : null}
        <div className="flex justify-center gap-2 pt-2">
          <Button onClick={() => retry()}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
