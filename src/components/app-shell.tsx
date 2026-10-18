import { Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/site-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { AppNav, type NavItem } from "@/components/app-nav";
import { Button } from "@/components/ui/button";

/** Authenticated application chrome shared by the dashboard and admin areas. */
export function AppShell({
  user,
  items,
  children,
  showNewLink = false,
}: {
  user: { name: string; email: string; isAdmin: boolean };
  items: NavItem[];
  children: ReactNode;
  showNewLink?: boolean;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-0 px-4 sm:px-6">
          <div className="flex h-16 items-center">
            <Logo />
          </div>
          <div className="order-last -mx-4 w-[calc(100%+2rem)] border-t px-4 py-2 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:border-t-0 lg:p-0">
            <AppNav items={items} />
          </div>
          <div className="ml-auto flex h-16 items-center gap-1.5 lg:ml-0">
            {showNewLink ? (
              <Button size="sm" asChild className="mr-1">
                <Link href="/dashboard/links/new">
                  <Plus className="size-4" aria-hidden />
                  <span className="hidden sm:inline">Create link</span>
                  <span className="sr-only sm:hidden">Create link</span>
                </Link>
              </Button>
            ) : null}
            <ThemeToggle />
            <UserMenu {...user} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 text-xs text-muted-foreground sm:px-6">
          <span>Times are shown in UTC.</span>
          <Link href="/docs/api" className="hover:text-foreground">
            API reference
          </Link>
        </div>
      </footer>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <h1 className="truncate font-display text-4xl leading-tight sm:text-[2.75rem]">{title}</h1>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
