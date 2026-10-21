import { ArrowRight, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { GithubIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { InsightCards } from "@/features/analytics/components/analytics-view";
import { Heatmap } from "@/features/analytics/components/heatmap";
import { deriveInsights } from "@/features/analytics/insights";
import { buildDemoAnalytics } from "@/features/demo/generate";
import { QuickShorten } from "@/features/links/components/quick-shorten";
import { AnalyticsPreview } from "@/features/marketing/components/analytics-preview";
import { FeatureBento } from "@/features/marketing/components/feature-bento";
import { HowItWorks } from "@/features/marketing/components/how-it-works";
import { APP_NAME, GITHUB_URL } from "@/lib/constants";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

const FACTS = [
  "100% Free & Open Source",
  "No Ads or Invasive Tracking",
  "Custom QR Codes & Social Cards",
  "Instant One-Click Links",
];

const delay = (ms: number) => ({ "--rise-delay": `${ms}ms` }) as CSSProperties;

function SectionHeading({ title, body, id }: { title: ReactNode; body: string; id: string }) {
  return (
    <Reveal className="mx-auto mb-14 max-w-2xl text-center">
      <h2 id={id} className="font-display text-3xl leading-[1.08] text-balance sm:text-5xl">
        {title}
      </h2>
      <p className="mt-4 text-lg text-balance text-muted-foreground">{body}</p>
    </Reveal>
  );
}

export default async function HomePage() {
  const [session, settings, nonce] = await Promise.all([
    getSession(),
    getContainer().settings.get(),
    headers().then((h) => h.get("x-nonce") ?? undefined),
  ]);
  const { abuse } = getContainer();
  const host = new URL(env.SITE_URL).host;
  const launch = buildDemoAnalytics("launch", "30d");
  const menu = buildDemoAnalytics("menu", "30d");

  return (
    <>
      {/* Hero */}
      <section className="relative -mt-16 overflow-hidden pt-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)] opacity-70"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-[38rem] left-1/2 h-[28rem] w-[60rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pt-16 text-center sm:px-6 sm:pt-24">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="animate-rise inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-xs text-muted-foreground shadow-xs transition-colors hover:text-foreground"
          >
            <GithubIcon className="size-3.5" /> 100% Free &amp; Open Source
            <ArrowRight className="size-3" aria-hidden />
          </a>
          <h1
            className="animate-rise mt-7 max-w-4xl font-display text-[2.6rem] leading-[1.02] text-balance sm:text-[4.4rem]"
            style={delay(80)}
          >
            Short links you own. <em className="text-primary">Numbers</em> you can trust.
          </h1>
          <p
            className="animate-rise mt-6 max-w-xl text-lg text-balance text-muted-foreground"
            style={delay(160)}
          >
            {APP_NAME} shortens links, creates custom QR codes, and gives you clear visitor insights in
            seconds. Simple, fast, and completely open source.
          </p>
          <div className="animate-rise mt-9 flex w-full justify-center" style={delay(240)}>
            <QuickShorten
              signedIn={!!session}
              anonymousAllowed={settings.allowAnonymousLinks}
              turnstileSiteKey={abuse.captchaSiteKey}
              nonce={nonce}
            />
          </div>
          <div
            className="animate-rise flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm"
            style={delay(300)}
          >
            <Link href="/demo" className="inline-flex items-center gap-1.5 font-medium hover:text-primary">
              Try the live demo <ArrowRight className="size-4" aria-hidden />
            </Link>
            <a
              href="#use-cases"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              Who it&apos;s for
            </a>
          </div>

          <div
            className="animate-rise relative mt-16 w-full max-w-5xl text-left [perspective:2000px] sm:mt-20"
            style={delay(420)}
          >
            <Link href="/demo" aria-label="Open the live demo" className="block">
              <AnalyticsPreview
                data={launch}
                host={host}
                code="launch"
                className="[transform:rotateX(8deg)] transition-transform duration-700 ease-out hover:[transform:rotateX(0deg)]"
              />
            </Link>
          </div>
        </div>

        <div className="relative mt-16 border-y bg-card/70 backdrop-blur-sm">
          <ul className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-4">
            {FACTS.map((fact, i) => (
              <li
                key={fact}
                className={`px-4 py-5 text-center font-mono text-xs text-muted-foreground sm:text-sm ${i > 0 ? "sm:border-l" : ""} ${i % 2 === 1 ? "border-l sm:border-l" : ""} ${i > 1 ? "border-t sm:border-t-0" : ""}`}
              >
                {fact}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32" aria-labelledby="how-title">
        <SectionHeading
          id="how-title"
          title={
            <>
              From long URL to <em className="text-primary">clear answers</em>
            </>
          }
          body="Three steps, no tracking pixels, no third-party scripts on your links."
        />
        <HowItWorks host={host} />
      </section>

      {/* Features */}
      <section id="features" className="border-t bg-card/40" aria-labelledby="features-title">
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <SectionHeading
            id="features-title"
            title="Everything a link needs"
            body="The features of a premium link platform, completely free, beautifully designed, and 100% open source."
          />
          <FeatureBento
            series={launch.timeseries.map((p) => p.clicks)}
            totalClicks={launch.summary.totalClicks}
            qrValue={`https://${host}/menu`}
            host={host}
          />
        </div>
      </section>

      {/* Analytics spotlight */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32" aria-labelledby="spotlight-title">
        <div className="grid items-center gap-12 lg:grid-cols-[1.25fr_1fr] [&>*]:min-w-0">
          <Reveal className="order-last space-y-4 lg:order-first">
            <div className="rounded-3xl border bg-card p-5 shadow-paper sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="font-medium">When people scan the menu</p>
                <span className="rounded-md bg-accent px-2 py-0.5 font-mono text-xs text-accent-foreground">
                  {host}/menu
                </span>
              </div>
              <Heatmap cells={menu.heatmap} />
            </div>
            <InsightCards
              insights={deriveInsights(menu).slice(0, 2)}
              className="sm:grid-cols-2 xl:grid-cols-2"
            />
          </Reveal>
          <Reveal delay={100} className="space-y-6">
            <h2 id="spotlight-title" className="font-display text-3xl leading-[1.08] sm:text-5xl">
              A restaurant learns it should <em className="text-primary">staff up on Fridays</em>.
            </h2>
            <p className="text-lg text-muted-foreground">
              One QR code on each table. A month later the owner knows the dinner rush starts at 19:00, that
              nine in ten guests scan with a phone, and that Mondays are dead. That is the kind of answer
              every link in {APP_NAME} gives you.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" variant="ink" asChild>
                <Link href="/demo?scenario=menu">
                  Explore this example <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/demo">See all three</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Who it's for */}
      <section id="use-cases" className="bg-ink text-ink-foreground" aria-labelledby="usecases-title">
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 overflow-hidden px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-2 [&>*]:min-w-0">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 -right-40 size-[32rem] rounded-full bg-primary/25 blur-[120px]"
          />
          <Reveal className="relative space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-primary">
              <Sparkles className="size-3.5" /> Built for Everyone
            </div>
            <h2 id="usecases-title" className="font-display text-3xl leading-[1.08] sm:text-5xl">
              Simple for everyone. <em className="text-primary">Powerful</em> when you need it.
            </h2>
            <p className="max-w-md text-lg text-white/65">
              Whether you are a creator sharing your bio link, a restaurant printing QR menus, or a business
              running campaigns — {APP_NAME} gives you clean links and instant insights without complexity.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link href={session ? "/dashboard" : "/sign-up"}>
                  {session ? "Open dashboard" : "Get started free"}{" "}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                asChild
                className="text-white/80 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
              >
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <GithubIcon className="mr-2 inline size-4" /> Star on GitHub
                </a>
              </Button>
            </div>
          </Reveal>
          <Reveal delay={120} className="relative space-y-3.5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-transform duration-300 hover:translate-x-1">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-xl bg-primary/20 text-primary">
                  <Sparkles className="size-4" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Creators &amp; Social Bios</h3>
                  <p className="text-xs text-white/60">
                    One clean, memorable link for Instagram, TikTok, and YouTube.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-transform duration-300 hover:translate-x-1">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-xl bg-primary/20 text-primary">
                  <QrCode className="size-4" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Cafes, Restaurants &amp; Events</h3>
                  <p className="text-xs text-white/60">
                    Generate high-res QR codes for tables and flyers. Change the destination link anytime.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-transform duration-300 hover:translate-x-1">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-xl bg-primary/20 text-primary">
                  <ShieldCheck className="size-4" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Private &amp; Expiring Links</h3>
                  <p className="text-xs text-white/60">
                    Protect links with passwords, set expiry dates or visit caps for exclusive drops.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Final call to action */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-dots [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] opacity-60"
        />
        <Reveal className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-28 text-center sm:px-6 sm:py-36">
          <h2 className="font-display text-4xl leading-[1.05] text-balance sm:text-6xl">
            Make your next link <em className="text-primary">count</em>.
          </h2>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            Free forever and open source under the MIT license.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button size="lg" variant="ink" asChild>
              <Link href={session ? "/dashboard" : "/sign-up"}>
                {session ? "Open your dashboard" : "Get started"}{" "}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/demo">View the demo</Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </>
  );
}
