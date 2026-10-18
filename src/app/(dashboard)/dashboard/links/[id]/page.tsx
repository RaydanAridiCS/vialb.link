import { ArrowLeft, CornerDownRight, Download, Lock, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnalyticsView } from "@/features/analytics/components/analytics-view";
import { parseAnalyticsParams } from "@/features/analytics/schemas";
import { LinkQuickActions } from "@/features/links/components/link-actions";
import { loadOwnedLink } from "@/features/links/queries";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requireSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { ValidationError } from "@/server/errors";

export const metadata: Metadata = { title: "Link analytics" };

export default async function LinkAnalyticsPage({
  params,
  searchParams,
}: PageProps<"/dashboard/links/[id]">) {
  const [{ id }, rawQuery] = await Promise.all([params, searchParams]);
  const { actor } = await requireSession();
  const link = await loadOwnedLink(id);
  const query = parseAnalyticsParams(rawQuery);

  let data;
  let rangeError: string | null = null;
  try {
    data = await getContainer().analytics.getLinkAnalytics(actor, link.id, {
      range: query.range,
      from: query.from,
      to: query.to,
      includeBots: query.bots,
    });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    rangeError = error.message;
    data = await getContainer().analytics.getLinkAnalytics(actor, link.id, {
      range: "7d",
      includeBots: query.bots,
    });
  }

  const exportQuery = new URLSearchParams({ range: query.range, ...(query.bots ? { bots: "1" } : {}) });
  if (query.range === "custom" && query.from && query.to) {
    exportQuery.set("from", query.from.toISOString());
    exportQuery.set("to", query.to.toISOString());
  }

  return (
    <>
      <Link
        href="/dashboard/links"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All links
      </Link>
      <PageHeader
        title={link.title ?? `/${link.code}`}
        description={
          <div className="space-y-3 pt-1">
            <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <a
                href={link.shortUrl}
                target="_blank"
                rel="noreferrer"
                className="w-fit rounded-md bg-accent px-2 py-0.5 font-mono text-sm text-accent-foreground hover:underline"
              >
                {link.shortUrl.replace(/^https?:\/\//, "")}
              </a>
              <p className="flex min-w-0 items-center gap-1.5">
                <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{link.destinationUrl}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={link.status === "active" ? "success" : "secondary"} className="capitalize">
                <span
                  aria-hidden
                  className={
                    link.status === "active"
                      ? "size-1.5 rounded-full bg-success"
                      : "size-1.5 rounded-full bg-muted-foreground"
                  }
                />
                {link.status.replace("_", " ")}
              </Badge>
              {link.hasPassword ? (
                <Badge variant="outline">
                  <Lock className="size-3" /> Password
                </Badge>
              ) : null}
              {link.expiresAt ? (
                <Badge variant="outline">Expires {formatDateTime(link.expiresAt)}</Badge>
              ) : null}
              {link.maxClicks !== null ? (
                <Badge variant="outline">
                  {formatNumber(link.clickCount)} / {formatNumber(link.maxClicks)} visits
                </Badge>
              ) : null}
            </div>
          </div>
        }
        actions={
          <>
            <LinkQuickActions link={link} />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/links/${link.id}/edit`}>
                <Pencil className="size-4" /> Edit
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/app/links/${link.id}/clicks.csv?${exportQuery}`} download>
                <Download className="size-4" /> Export CSV
              </a>
            </Button>
          </>
        }
      />

      <AnalyticsView
        data={data}
        range={rangeError ? "7d" : query.range}
        includeBots={query.bots}
        from={query.from?.toISOString()}
        to={query.to?.toISOString()}
        notice={
          rangeError ? (
            <p role="alert" className="text-sm text-destructive">
              {rangeError} Showing the last 7 days instead.
            </p>
          ) : null
        }
      />
    </>
  );
}
