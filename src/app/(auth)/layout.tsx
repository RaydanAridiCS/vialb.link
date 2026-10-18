import { Logo } from "@/components/site-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthAside } from "@/features/marketing/components/auth-aside";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col">
        <header className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Logo />
          <ThemeToggle />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
      <AuthAside />
    </div>
  );
}
