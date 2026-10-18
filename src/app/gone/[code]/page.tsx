import { Ban, Clock, Gauge } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CenteredPage, StatusNumber } from "@/components/centered-page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Link unavailable", robots: { index: false, follow: false } };

const REASONS = {
  expired: {
    icon: Clock,
    title: "This link has expired",
    body: "The owner set this link to stop working after a certain date.",
  },
  limit: {
    icon: Gauge,
    title: "This link reached its visit limit",
    body: "The owner allowed only a limited number of visits, and they've all been used.",
  },
  disabled: {
    icon: Ban,
    title: "This link has been disabled",
    body: "The owner or an administrator turned this link off.",
  },
} as const;

/** Themed "410 Gone" page for expired / limit-reached / disabled links. */
export default async function GonePage({ params, searchParams }: PageProps<"/gone/[code]">) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const reason =
    typeof query.reason === "string" && query.reason in REASONS
      ? (query.reason as keyof typeof REASONS)
      : "disabled";
  const { icon: Icon, title, body } = REASONS[reason];
  return (
    <CenteredPage>
      <div className="space-y-5 text-center" data-testid="gone-page" data-reason={reason}>
        <StatusNumber>410</StatusNumber>
        <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
          <Icon className="size-3.5 text-primary" aria-hidden />/{code}
        </div>
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
        <div className="pt-2">
          <Button asChild>
            <Link href="/">Create your own short link</Link>
          </Button>
        </div>
      </div>
    </CenteredPage>
  );
}
