import {
  BarChart3,
  Code2,
  Container,
  Globe2,
  KeyRound,
  Lock,
  QrCode,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { headers } from "next/headers";
import { GithubIcon } from "@/components/icons";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QuickShorten } from "@/features/links/components/quick-shorten";
import { APP_NAME, GITHUB_URL } from "@/lib/constants";
import { getSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

const FEATURES = [
  {
    icon: BarChart3,
    title: "Privacy-friendly analytics",
    body: "Countries, devices, referrers and UTM campaigns — computed in SQL from hashed visitor IDs. Raw IPs are never stored.",
  },
  {
    icon: Lock,
    title: "Password protection",
    body: "Gate links behind an argon2id-hashed password. Crawlers never see the destination.",
  },
  {
    icon: Timer,
    title: "Expiry & access limits",
    body: "Links that expire after a date or a number of visits, enforced atomically in the database.",
  },
  {
    icon: QrCode,
    title: "QR codes",
    body: "Branded QR codes in PNG or SVG, generated on demand with your colours.",
  },
  {
    icon: Code2,
    title: "REST API",
    body: "Typed, documented OpenAPI 3.1 API with personal API keys and per-key rate limits.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by default",
    body: "Strict CSP, 2FA, rate limiting, domain blocklists and optional Safe Browsing checks.",
  },
  {
    icon: Globe2,
    title: "Custom codes & link previews",
    body: "Pick memorable codes and control the title, description and image shown in chats.",
  },
  {
    icon: KeyRound,
    title: "Teams-ready auth",
    body: "Email + password, optional GitHub/Google sign-in, admin roles and TOTP two-factor.",
  },
];

export default async function HomePage() {
  const [session, settings, nonce] = await Promise.all([
    getSession(),
    getContainer().settings.get(),
    headers().then((h) => h.get("x-nonce") ?? undefined),
  ]);
  const { abuse } = getContainer();

  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--color-muted),transparent_60%)]"
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-20 text-center sm:py-28">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <GithubIcon className="size-3.5" /> Open source · MIT licensed · Self-hostable
          </a>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              Short links you own,
              <br className="hidden sm:block" /> analytics you can trust.
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-balance text-muted-foreground">
              {APP_NAME} is a fast, privacy-respecting URL shortener you can run on your own server in
              minutes.
            </p>
          </div>
          <QuickShorten
            signedIn={!!session}
            anonymousAllowed={settings.allowAnonymousLinks}
            turnstileSiteKey={abuse.captchaSiteKey}
            nonce={nonce}
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20" aria-labelledby="features-title">
        <h2 id="features-title" className="mb-10 text-center text-3xl font-bold tracking-tight">
          Everything a link needs
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-card p-5">
              <Icon className="mb-3 size-5 text-primary" aria-hidden />
              <h3 className="mb-1 font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center">
          <Container className="size-8 text-primary" aria-hidden />
          <h2 className="text-3xl font-bold tracking-tight">Self-host in three commands</h2>
          <pre className="w-full max-w-xl overflow-x-auto rounded-lg bg-muted p-4 text-left text-sm">
            <code>{`git clone ${GITHUB_URL}.git && cd toolwright
cp .env.example .env   # set SITE_URL + BETTER_AUTH_SECRET
docker compose up -d`}</code>
          </pre>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <a href={`${GITHUB_URL}/blob/main/docs/self-hosting.md`}>Self-hosting guide</a>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/docs/api">Explore the API</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
