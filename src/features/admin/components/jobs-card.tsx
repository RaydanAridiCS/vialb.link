"use client";

import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelative } from "@/lib/format";
import { runJobNowAction } from "../actions";

export interface JobRow {
  name: string;
  lastStatus: "ok" | "error" | null;
  lastFinishedAt: string | null;
  lastSummary: string | null;
  lastError: string | null;
}

const LABELS: Record<string, string> = {
  "link-health": "Link health checks",
  "weekly-report": "Weekly report emails",
  "broken-links-digest": "Broken-links emails",
  retention: "Data retention",
};

/** What the background scheduler last did, with a "run now" for each job. */
export function JobsCard({ jobs }: { jobs: JobRow[] }) {
  const router = useRouter();
  const run = useAction(runJobNowAction, {
    onSuccess: ({ data }) => {
      if (data.started) toast.success("Job ran");
      else toast.info("The job is disabled, unknown or already running");
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Could not run the job"),
  });
  return (
    <Card className="mt-6" data-testid="jobs-card">
      <CardHeader>
        <CardTitle className="font-display text-xl">Background jobs</CardTitle>
        <CardDescription>
          Jobs that have run on this instance. A job that is switched off does not run, even from here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {Object.keys(LABELS).map((name) => {
            const job = jobs.find((j) => j.name === name);
            return (
              <li key={name} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 space-y-0.5" data-testid={`job-${name}`}>
                  <p className="font-medium">{LABELS[name]}</p>
                  <p className="text-muted-foreground">
                    {job?.lastFinishedAt
                      ? `${formatRelative(job.lastFinishedAt)}: ${job.lastError ?? job.lastSummary ?? "done"}`
                      : "Has not run yet"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {job?.lastStatus === "error" ? <Badge variant="destructive">Failed</Badge> : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={run.isPending}
                    onClick={() => run.execute({ name: name as never })}
                    aria-label={`Run ${LABELS[name]} now`}
                  >
                    {run.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Play className="size-4" />
                    )}
                    Run now
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
