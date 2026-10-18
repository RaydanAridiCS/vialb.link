import { ClipboardPaste, QrCode, Share2, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";

function Step({
  number,
  title,
  body,
  icon,
  children,
  delay,
}: {
  number: string;
  title: string;
  body: string;
  icon: ReactNode;
  children: ReactNode;
  delay: number;
}) {
  return (
    <Reveal as="li" delay={delay} className="relative flex flex-col">
      <div className="flex items-center gap-3">
        <span className="font-display text-4xl leading-none text-primary">{number}</span>
        <span className="h-px flex-1 bg-border" aria-hidden />
        <span className="text-muted-foreground [&_svg]:size-5" aria-hidden>
          {icon}
        </span>
      </div>
      <h3 className="mt-5 text-lg font-medium tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
      <div className="mt-6 flex min-h-32 flex-1 items-center rounded-2xl border bg-card p-4 shadow-paper">
        {children}
      </div>
    </Reveal>
  );
}

export function HowItWorks({ host }: { host: string }) {
  return (
    <ol className="grid gap-10 md:grid-cols-3 md:gap-8 [&>*]:min-w-0">
      <Step
        number="1"
        title="Paste a long link"
        body="Pick a custom code if you like, add an expiry, a visit limit or a password."
        icon={<ClipboardPaste />}
        delay={0}
      >
        <div className="w-full space-y-2">
          <div className="truncate rounded-lg border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
            https://acme.dev/blog/introducing-acme-2?ref=nav
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
              {host}/
            </span>
            <span className="flex-1 rounded-lg border border-primary/40 bg-accent px-3 py-2 font-mono text-xs text-accent-foreground">
              launch
            </span>
          </div>
        </div>
      </Step>
      <Step
        number="2"
        title="Share it anywhere"
        body="Post it, print it as a QR code or send it by email."
        icon={<Share2 />}
        delay={100}
      >
        <div className="flex w-full items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm text-primary">{host}/launch</p>
            <p className="mt-1 text-xs text-muted-foreground">Copied to clipboard</p>
          </div>
          <span className="grid size-12 shrink-0 place-items-center rounded-xl border bg-background">
            <QrCode className="size-6" aria-hidden />
          </span>
        </div>
      </Step>
      <Step
        number="3"
        title="Learn what worked"
        body="See which channel, country and hour brought the clicks, and plan the next post."
        icon={<TrendingUp />}
        delay={200}
      >
        <ul className="w-full space-y-1.5 text-xs">
          {[
            ["news.ycombinator.com", 46],
            ["x.com", 21],
            ["linkedin.com", 12],
          ].map(([label, width]) => (
            <li key={label} className="relative flex justify-between rounded-md px-2 py-1.5">
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 rounded-md bg-primary/12"
                style={{ width: `${width}%` }}
              />
              <span className="relative">{label}</span>
              <span className="relative font-mono text-muted-foreground">{width}%</span>
            </li>
          ))}
        </ul>
      </Step>
    </ol>
  );
}
