import { Link2 } from "lucide-react";
import { GithubIcon } from "@/components/icons";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { APP_NAME, GITHUB_URL } from "@/lib/constants";
import { getSession } from "@/server/auth/session";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 font-semibold tracking-tight ${className ?? ""}`}>
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <Link2 className="size-4" aria-hidden />
      </span>
      <span>{APP_NAME}</span>
    </Link>
  );
}

export async function SiteHeader() {
  const session = await getSession();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href="/docs/api">API</Link>
          </Button>
          <Button variant="ghost" size="icon" asChild className="hidden sm:inline-flex">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="GitHub repository">
              <GithubIcon className="size-4" />
            </a>
          </Button>
          <ThemeToggle />
          {session ? (
            <>
              <Button size="sm" asChild>
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
              <Button variant="ghost" size="sm" asChild>
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/sign-up">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
        <p>
          {APP_NAME} is open source under the MIT license.{" "}
          <a className="underline underline-offset-4" href={GITHUB_URL} target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
        </p>
        <nav aria-label="Footer" className="flex gap-4">
          <Link className="hover:text-foreground" href="/docs/api">
            API docs
          </Link>
          <a className="hover:text-foreground" href={`${GITHUB_URL}/blob/main/docs/self-hosting.md`}>
            Self-hosting
          </a>
        </nav>
      </div>
    </footer>
  );
}
