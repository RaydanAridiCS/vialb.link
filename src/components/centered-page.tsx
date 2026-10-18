import type { ReactNode } from "react";
import { Logo } from "@/components/site-shell";
import { ThemeToggle } from "@/components/theme-toggle";

/** Minimal themed layout for standalone pages (password, gone, 404). */
export function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] opacity-60"
      />
      <header className="relative flex h-16 items-center justify-between px-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="main" className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}

/** Large serif status line used by the 404, gone and error pages. */
export function StatusNumber({ children }: { children: ReactNode }) {
  return (
    <p aria-hidden className="font-display text-[7rem] leading-none text-primary sm:text-[9rem]">
      {children}
    </p>
  );
}
