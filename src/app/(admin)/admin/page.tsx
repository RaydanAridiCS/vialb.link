import { Link2, MousePointerClick, Timer, Users } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { InstanceSettingsForm } from "@/features/admin/components/instance-settings-form";
import { JobsCard } from "@/features/admin/components/jobs-card";
import { KpiCard } from "@/features/analytics/components/kpi-card";
import { requireAdminSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const { actor } = await requireAdminSession();
  const { admin, settings, repos } = getContainer();
  const [stats, detailed, jobs] = await Promise.all([
    admin.stats(actor),
    settings.getDetailed(),
    repos.jobs.list(),
  ]);
  return (
    <>
      <PageHeader title="Instance" description="Statistics and settings for this Vialb instance." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Users" value={stats.users} icon={<Users className="size-4" />} />
        <KpiCard label="Links" value={stats.links} icon={<Link2 className="size-4" />} />
        <KpiCard
          label="Clicks (all time)"
          value={stats.clicks}
          icon={<MousePointerClick className="size-4" />}
        />
        <KpiCard label="Clicks, last 24 hours" value={stats.clicks24h} icon={<Timer className="size-4" />} />
      </div>
      <InstanceSettingsForm
        overrides={detailed.overrides}
        defaults={detailed.defaults}
        effective={detailed.effective}
      />
      <JobsCard
        jobs={jobs.map((job) => ({
          name: job.name,
          lastStatus: job.lastStatus,
          lastFinishedAt: job.lastFinishedAt?.toISOString() ?? null,
          lastSummary: job.lastSummary,
          lastError: job.lastError,
        }))}
      />
    </>
  );
}
