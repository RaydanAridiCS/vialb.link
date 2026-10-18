import type { ReactNode } from "react";
import { Logo } from "@/components/site-shell";
import { ThemeToggle } from "@/components/theme-toggle";

/** Minimal themed layout for standalone pages (password, gone, 404). */
export function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between px-4">
        <Logo />
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
