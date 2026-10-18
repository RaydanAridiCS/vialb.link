import { ArrowRight, Check, Lock } from "lucide-react";
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
  "TOTP two-factor sign-in",
  "Admin roles and bans",
  "Domain blocklist",
  "Safe Browsing checks",
  "CSV export",
  "Bulk actions",
  "Anonymous links you can claim later",
  "GitHub and Google sign-in",
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
          body="Countries, devices, referrers, UTM campaigns and the hours people click. Computed in your own database."
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
          body="Gate a link behind a password, hashed with argon2id. Crawlers never see the destination."
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
          body="Stop a link after a date or a number of visits. Limits are enforced atomically in the database."
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
          body="Link visitors are counted with a daily-salted hash. Their IP addresses are never written to disk."
          delay={160}
        >
          <div className="flex w-full max-w-64 flex-col items-stretch gap-2 font-mono text-xs">
            <div className="rounded-lg border bg-card px-3 py-2 text-muted-foreground line-through decoration-primary/70">
              203.0.113.42
            </div>
            <div className="rounded-lg border bg-card px-3 py-2 text-muted-foreground">
              + browser + daily salt
            </div>
            <ArrowRight className="mx-auto size-4 rotate-90 text-primary" aria-hidden />
            <div className="rounded-lg border border-primary/30 bg-accent px-3 py-2 text-accent-foreground">
              visitor 3f9a…c21e
            </div>
          </div>
        </Tile>

        <Tile
          title="A real REST API"
          body="OpenAPI 3.1 with interactive docs, personal API keys and per-key rate limits."
          className="md:col-span-2"
        >
          <pre className="w-full max-w-xl overflow-x-auto rounded-2xl bg-ink p-5 font-mono text-[12.5px] leading-6 text-ink-foreground shadow-paper">
            <code>
              <span className="text-white/45"># Create a short link</span>
              {"\n"}
              <span className="text-primary">curl</span> -X POST https://{host}/api/v1/links \{"\n"}
              {"  "}-H <span className="text-[#9cc3f0]">&quot;Authorization: Bearer tw_••••&quot;</span> \
              {"\n"}
              {"  "}-d <span className="text-[#9cc3f0]">&apos;{`{"url":"https://example.com"}`}&apos;</span>
            </code>
          </pre>
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
