import { ArrowRight, Check, Lock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/reveal";
import { Sparkline } from "@/features/analytics/components/kpi-card";
import { QrPreview } from "@/features/links/components/qr-preview";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function Tile({
  title,
  body,
  children,
  className,
  delay = 0,
}: {
  title: string;
  body: string;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <Reveal
      delay={delay}
      className={cn(
        "group flex flex-col overflow-hidden rounded-3xl border bg-card shadow-paper transition-colors hover:border-foreground/15",
        className,
      )}
    >
      <div className="relative flex min-h-48 flex-1 items-center justify-center overflow-hidden border-b bg-muted/40 p-6">
        {children}
      </div>
      <div className="space-y-1.5 p-6">
        <h3 className="font-medium tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </Reveal>
  );
}

const ALSO = [
  "Instant one-click shortening",
  "Custom QR code colors",
  "Two-factor account security",
  "Safe link protection",
  "CSV data export",
  "Bulk link management",
  "Claim anonymous links anytime",
  "Google and GitHub sign-in",
];

export function FeatureBento({
  series,
  totalClicks,
  qrValue,
  host,
}: {
  series: number[];
  totalClicks: number;
  qrValue: string;
  host: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        <Tile
          title="Analytics you can act on"
          body="Countries, devices, referrers, UTM campaigns and the hours people click. Simple, visual and clear."
          className="md:col-span-2"
        >
          <div className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-paper">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Clicks, last 30 days</p>
                <p className="mt-1 font-mono text-3xl font-medium tabular-nums">
                  {formatNumber(totalClicks)}
                </p>
              </div>
              <div className="flex gap-1.5 text-xs">
                {["Referrers", "Countries", "Devices"].map((label, i) => (
                  <span
                    key={label}
                    className={cn(
                      "rounded-full border px-2.5 py-1",
                      i === 0
                        ? "border-transparent bg-ink text-ink-foreground dark:bg-foreground dark:text-background"
                        : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <Sparkline values={series} className="mt-4 h-20" />
          </div>
        </Tile>

        <Tile
          title="QR codes in your colors"
          body="Download PNG or SVG for print, packaging or a table card. Every scan is counted."
          delay={80}
        >
          <div className="rounded-2xl border bg-white p-3 shadow-paper transition-transform duration-500 group-hover:-rotate-2">
            <QrPreview value={qrValue} fg="#1A1814" bg="#FFFFFF" size={128} />
          </div>
        </Tile>

        <Tile
          title="Password protection"
          body="Lock sensitive links with a password. Visitors must unlock before seeing the destination."
        >
          <div className="w-full max-w-60 rounded-2xl border bg-card p-4 shadow-paper">
            <div className="mx-auto grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
              <Lock className="size-4" aria-hidden />
            </div>
            <p className="mt-3 text-center text-sm font-medium">Password required</p>
            <div className="mt-3 flex h-9 items-center rounded-lg border px-3 font-mono text-sm tracking-[0.3em] text-muted-foreground">
              ••••••••
            </div>
            <div className="mt-2 grid h-9 place-items-center rounded-lg bg-primary text-sm font-medium text-primary-foreground">
              Open link
            </div>
          </div>
        </Tile>

        <Tile
          title="Expiry and visit limits"
          body="Automatically stop a link after a specific date or a target number of visits."
          delay={80}
        >
          <div className="w-full max-w-64 space-y-4 rounded-2xl border bg-card p-4 shadow-paper">
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span>Visits</span>
                <span className="font-mono text-xs text-muted-foreground">312 / 500</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[62%] rounded-full bg-primary" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">Expires</span>
              <span className="font-mono text-xs">in 3 days</span>
            </div>
          </div>
        </Tile>

        <Tile
          title="Private by design"
          body="Visitors are counted without invasive cookies or tracking personal IP addresses."
          delay={160}
        >
          <div className="flex w-full max-w-64 flex-col items-stretch gap-2 font-mono text-xs">
            <div className="rounded-lg border bg-card px-3 py-2 text-muted-foreground line-through decoration-primary/70">
              203.0.113.42
            </div>
            <div className="rounded-lg border bg-card px-3 py-2 text-muted-foreground">+ privacy shield</div>
            <ArrowRight className="mx-auto size-4 rotate-90 text-primary" aria-hidden />
            <div className="rounded-lg border border-primary/30 bg-accent px-3 py-2 text-accent-foreground">
              visitor 3f9a…c21e
            </div>
          </div>
        </Tile>

        <Tile
          title="Custom links people actually click"
          body="Replace messy, 100-character URLs with clean, memorable names that build instant trust on social media, bios, and emails."
          className="md:col-span-2"
        >
          <div className="w-full max-w-lg space-y-3 rounded-2xl border bg-card p-5 shadow-paper">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Before &amp; After</span>
              <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <Sparkles className="size-3.5" /> 3.8× higher click-through
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground line-through opacity-70">
                <span className="truncate">
                  https://store.acme.shop/products/summer-sale?utm_source=instagram&amp;ref=camp_984
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-2 rounded-full bg-primary" />
                  <span className="truncate font-mono text-sm font-semibold text-foreground">
                    {host}/summer
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                  Ready to share
                </span>
              </div>
            </div>
          </div>
        </Tile>

        <Tile
          title="Link previews you control"
          body="Set the title, description and image people see when the link is shared in chat."
          delay={80}
        >
          <div className="w-full max-w-64 space-y-2">
            <div className="ml-auto w-fit rounded-2xl rounded-br-md bg-primary px-3 py-2 font-mono text-xs text-primary-foreground">
              {host}/launch
            </div>
            <div className="ml-auto w-56 overflow-hidden rounded-xl border bg-card shadow-paper">
              <div className="h-16 bg-[linear-gradient(135deg,var(--chart-1),var(--chart-2))]" />
              <div className="space-y-0.5 p-2.5">
                <p className="text-xs font-medium">Introducing Acme 2.0</p>
                <p className="text-[11px] text-muted-foreground">Faster builds and a new CLI.</p>
              </div>
            </div>
          </div>
        </Tile>
      </div>

      <Reveal className="rounded-3xl border bg-card p-6 shadow-paper">
        <p className="mb-4 text-sm text-muted-foreground">Also included</p>
        <ul className="flex flex-wrap gap-2">
          {ALSO.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
            >
              <Check className="size-3.5 text-primary" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  );
}
