"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface SiteNavLink {
  href: string;
  label: string;
  external?: boolean;
}

/** Sticky header that gains a paper background and hairline once the page scrolls. */
export function SiteHeaderFrame({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled ? "border-border bg-background/80 backdrop-blur-md" : "border-transparent bg-transparent",
      )}
    >
      {children}
    </header>
  );
}

export function MobileNav({ links, signedIn }: { links: SiteNavLink[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 gap-0 p-6">
        <SheetTitle className="font-display text-xl">Menu</SheetTitle>
        <nav aria-label="Mobile" className="mt-6 flex flex-col">
          {links.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="border-b py-3 text-base text-foreground/80 hover:text-foreground"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b py-3 text-base text-foreground/80 hover:text-foreground"
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>
        <div className="mt-6 flex flex-col gap-2">
          {signedIn ? (
            <Button asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button variant="ink" asChild>
                <Link href="/sign-up">Get started</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
