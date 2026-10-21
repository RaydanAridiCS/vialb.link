import Link from "next/link";
import { GithubIcon, LogoMark } from "@/components/icons";
import { MobileNav, SiteHeaderFrame, type SiteNavLink } from "@/components/site-header-frame";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { APP_NAME, GITHUB_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getSession } from "@/server/auth/session";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-4 focus-visible:ring-ring/25",
        className,
      )}
    >
      <LogoMark className="size-7" />
      <span className="font-display text-[1.3rem] leading-none">{APP_NAME}</span>
    </Link>
  );
}

const NAV_LINKS: SiteNavLink[] = [
  { href: "/demo", label: "Live demo" },
  { href: "/#features", label: "Features" },
  { href: "/#use-cases", label: "Who it's for" },
];

export async function SiteHeader() {
  const session = await getSession();
  return (
    <SiteHeaderFrame>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-1.5 text-sm text-foreground/70 transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild className="hidden sm:inline-flex">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="GitHub repository">
              <GithubIcon className="size-4" />
            </a>
          </Button>
          <ThemeToggle />
          {session ? (
            <>
              <Button size="sm" variant="ink" asChild className="ml-1 hidden sm:inline-flex">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <UserMenu
                name={session.user.name}
                email={session.user.email}
                isAdmin={session.user.role === "admin"}
              />
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button size="sm" variant="ink" asChild className="ml-1 hidden sm:inline-flex">
                <Link href="/sign-up">Get started</Link>
              </Button>
            </>
          )}
          <MobileNav
            links={[...NAV_LINKS, { href: GITHUB_URL, label: "GitHub", external: true }]}
            signedIn={!!session}
          />
        </div>
      </div>
    </SiteHeaderFrame>
  );
}

const FOOTER_COLUMNS: { title: string; links: SiteNavLink[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/demo", label: "Live demo" },
      { href: "/#features", label: "Features" },
      { href: "/#use-cases", label: "Who it's for" },
      { href: "/sign-up", label: "Create an account" },
    ],
  },
  {
    title: "Highlights",
    links: [
      { href: "/demo?scenario=menu", label: "Restaurant QR demo" },
      { href: "/demo?scenario=launch", label: "Campaign analytics" },
      { href: "/demo?scenario=portfolio", label: "Creator bio demo" },
    ],
  },
  {
    title: "Open Source",
    links: [
      { href: GITHUB_URL, label: "GitHub repository", external: true },
      { href: `${GITHUB_URL}/issues`, label: "Request a feature", external: true },
      { href: "/terms", label: "Terms of use" },
      { href: "/privacy", label: "Privacy policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-card/50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            Short links, custom QR codes and honest analytics. 100% free and open source.
          </p>
        </div>
        {FOOTER_COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="space-y-3">
            <h2 className="text-sm font-medium">{column.title}</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {column.links.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="transition-colors hover:text-foreground">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            {APP_NAME} is open source under the MIT license.{" "}
            <a className="underline underline-offset-4 hover:text-foreground" href={GITHUB_URL}>
              Source on GitHub
            </a>
          </p>
          <p>Link visitors&apos; IP addresses are never stored.</p>
        </div>
      </div>
    </footer>
  );
}
