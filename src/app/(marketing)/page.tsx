import { ArrowRight, BookOpen } from "lucide-react";
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
import { Terminal } from "@/features/marketing/components/terminal";
import { APP_NAME, GITHUB_URL } from "@/lib/constants";
import { env } from "@/lib/env";
import { getSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

const FACTS = ["MIT licensed", "Visitor IPs never stored", "OpenAPI 3.1", "One docker compose up"];

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
            <GithubIcon className="size-3.5" /> Open source and self-hostable
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
            {APP_NAME} shortens links, makes QR codes and shows you who clicked, from where and when. All on a
            server you control.
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
              href="#self-host"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              Run it on your server
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
            body="The features of a paid link platform, in one small app you can read, change and host yourself."
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

      {/* Self-host */}
      <section id="self-host" className="bg-ink text-ink-foreground" aria-labelledby="selfhost-title">
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 overflow-hidden px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-2 [&>*]:min-w-0">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 -right-40 size-[32rem] rounded-full bg-primary/25 blur-[120px]"
          />
          <Reveal className="relative space-y-6">
            <h2 id="selfhost-title" className="font-display text-3xl leading-[1.08] sm:text-5xl">
              Your links. Your server. <em className="text-primary">Your data.</em>
            </h2>
            <p className="max-w-md text-lg text-white/65">
              One Docker Compose file starts the app and Postgres, with Redis as an option. Back it up like
              any other database and move it whenever you want.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <a href={`${GITHUB_URL}/blob/main/docs/self-hosting.md`}>
                  <BookOpen className="size-4" aria-hidden /> Self-hosting guide
                </a>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                asChild
                className="text-white/80 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
              >
                <Link href="/docs/api">Explore the API</Link>
              </Button>
            </div>
          </Reveal>
          <Reveal delay={120} className="relative">
            <Terminal
              lines={[
                `git clone ${GITHUB_URL}.git && cd toolwright`,
                "cp .env.example .env",
                "# set SITE_URL and BETTER_AUTH_SECRET in .env",
                "docker compose up -d",
              ]}
            />
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
            Free and open source under the MIT license.
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
