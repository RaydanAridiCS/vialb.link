import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Shared layout for the terms and privacy pages: title, contents list and readable prose. */
export function LegalPage({
  title,
  intro,
  updatedAt,
  sections,
  related,
}: {
  title: string;
  intro: ReactNode;
  updatedAt: string;
  sections: LegalSection[];
  related: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <header className="max-w-3xl space-y-4 border-b pb-10">
        <p className="text-sm text-muted-foreground">Last updated {formatDate(`${updatedAt}T12:00:00Z`)}</p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">{title}</h1>
        <div className="text-lg text-muted-foreground">{intro}</div>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[220px_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24 space-y-1 text-sm">
            <p className="mb-3 font-medium">On this page</p>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {section.title}
              </a>
            ))}
            <Link
              href={related.href}
              className="mt-4 block border-t px-2 pt-4 text-muted-foreground hover:text-foreground"
            >
              {related.label}
            </Link>
          </div>
        </nav>

        <div className="max-w-3xl space-y-12">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="flex items-baseline gap-3 font-display text-2xl">
                <span className="font-mono text-sm font-normal text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {section.title}
              </h2>
              <div className="mt-4 space-y-4 leading-7 text-foreground/85 [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
