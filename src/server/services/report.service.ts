import { RATE_LIMITS } from "@/lib/constants";
import { countryName } from "@/lib/format";
import { describeHealthReason } from "@/lib/link-health";
import type { Logger } from "@/lib/logger";
import type { Actor, UserPreferences, Workspace, WorkspaceMember } from "@/server/domain/types";
import { NotFoundError, ValidationError } from "@/server/errors";
import { renderBrokenLinksEmail, renderWeeklyReportEmail } from "@/server/auth/report-email-templates";
import { lastScheduledInstant, periodKeyFor } from "@/server/lib/schedule";
import type { Clock } from "@/server/ports/clock";
import type { Mailer } from "@/server/ports/mailer";
import type { IClickRepository } from "@/server/repositories/click.repository";
import type { DeliveryKey, IEmailDeliveryRepository } from "@/server/repositories/email-delivery.repository";
import type { ILinkHealthRepository } from "@/server/repositories/link-health.repository";
import type { IUserPreferencesRepository } from "@/server/repositories/user-preferences.repository";
import type { IUserRepository } from "@/server/repositories/user.repository";
import type { IWorkspaceRepository } from "@/server/repositories/workspace.repository";
import type { AbuseService } from "./abuse.service";
import { requireUser } from "./authorization";
import type { SettingsService } from "./settings.service";

const WEEK_MS = 7 * 24 * 3_600_000;
/** A report is still sent up to this long after its scheduled time (restarts, downtime), then skipped. */
const CATCH_UP_MS = 24 * 3_600_000;
/** An unfinished send blocks others for this long before another pass may take it over. */
const STALE_CLAIM_MS = 3_600_000;
const MAX_LISTED_LINKS = 20;

export interface ReportServiceDeps {
  clicks: IClickRepository;
  workspaces: IWorkspaceRepository;
  users: IUserRepository;
  preferences: IUserPreferencesRepository;
  deliveries: IEmailDeliveryRepository;
  health: ILinkHealthRepository;
  abuse: AbuseService;
  mailer: Mailer;
  settings: SettingsService;
  clock: Clock;
  logger: Logger;
  siteUrl: string;
  siteName: string;
}

type Kind = DeliveryKey["kind"];

interface Message {
  subject: string;
  text: string;
  html: string;
}

const dayFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const dayYearFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "May 25 – Jun 1, 2026": the week that ends at `end`. */
export function periodLabel(start: Date, end: Date): string {
  return `${dayFormat.format(start)} – ${dayYearFormat.format(end)}`;
}

/** Keeps a workspace name from breaking out of a header line. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Scheduled emails: the weekly analytics report and the broken-links digest. Both run from the job
 * runner, pick the period from the configured send time, and claim each (workspace, person, period) in
 * the delivery ledger before sending, so no email goes out twice.
 */
export class ReportService {
  constructor(private readonly deps: ReportServiceDeps) {}

  private get dashboardUrl() {
    return `${this.deps.siteUrl}/dashboard`;
  }

  private get settingsUrl() {
    return `${this.deps.siteUrl}/dashboard/settings`;
  }

  async isEnabled(): Promise<boolean> {
    return (await this.deps.settings.get()).weeklyReportEnabled && this.deps.mailer.isConfigured;
  }

  async isBrokenLinksEnabled(): Promise<boolean> {
    const settings = await this.deps.settings.get();
    return settings.weeklyReportEnabled && settings.healthMonitorEnabled && this.deps.mailer.isConfigured;
  }

  /** What the settings page needs: this person's choices and whether the instance sends anything at all. */
  async emailSettings(actor: Actor): Promise<{
    preferences: UserPreferences;
    reportsEnabled: boolean;
    brokenLinksEnabled: boolean;
    mailConfigured: boolean;
  }> {
    const user = requireUser(actor);
    const preferences = (await this.deps.preferences.getMany([user.userId])).get(user.userId);
    return {
      preferences: preferences ?? { userId: user.userId, weeklyReport: true, brokenLinksEmail: true },
      reportsEnabled: await this.isEnabled(),
      brokenLinksEnabled: await this.isBrokenLinksEnabled(),
      mailConfigured: this.deps.mailer.isConfigured,
    };
  }

  async setPreferences(
    actor: Actor,
    patch: Partial<Pick<UserPreferences, "weeklyReport" | "brokenLinksEmail">>,
  ): Promise<UserPreferences> {
    const user = requireUser(actor);
    return this.deps.preferences.upsert(user.userId, patch);
  }

  /** The send moment this pass belongs to, or `null` when it is too long after it (or before any). */
  private async currentSlot(): Promise<{ instant: Date; key: string } | null> {
    const settings = await this.deps.settings.get();
    const now = this.deps.clock.now();
    const instant = lastScheduledInstant(now, settings.reportSendDay, settings.reportSendHourUtc);
    if (now.getTime() - instant.getTime() > CATCH_UP_MS) return null;
    return { instant, key: periodKeyFor(instant) };
  }

  async runWeekly(): Promise<string> {
    const slot = await this.currentSlot();
    if (!slot) return "outside the send window";
    const to = slot.instant;
    const from = new Date(to.getTime() - WEEK_MS);
    const workspaceIds = await this.deps.clicks.activeWorkspaces(new Date(from.getTime() - WEEK_MS), to);

    let sent = 0;
    for (const workspaceId of workspaceIds) {
      sent += await this.deliverToWorkspace("weekly_report", workspaceId, slot.key, async (workspace) => {
        const report = await this.deps.clicks.workspaceReport(workspaceId, from, to);
        if (report.clicks === 0 && report.previousClicks === 0) return null;
        const { text, html } = renderWeeklyReportEmail({
          appName: this.deps.siteName,
          siteUrl: this.deps.siteUrl,
          workspaceName: workspace.name,
          periodLabel: periodLabel(from, to),
          dashboardUrl: this.dashboardUrl,
          settingsUrl: this.settingsUrl,
          report,
          countryName,
        });
        return {
          subject: oneLine(`Your week on ${this.deps.siteName}: ${workspace.name} (${report.clicks} clicks)`),
          text,
          html,
        };
      });
    }
    return `${sent} report emails sent for ${workspaceIds.length} active workspaces`;
  }

  async runBrokenLinks(): Promise<string> {
    const slot = await this.currentSlot();
    if (!slot) return "outside the send window";
    const workspaceIds = await this.deps.health.listWorkspacesWithFlagged();

    let sent = 0;
    for (const workspaceId of workspaceIds) {
      sent += await this.deliverToWorkspace("broken_links", workspaceId, slot.key, async (workspace) => {
        const flagged = await this.deps.health.listFlaggedByWorkspace(workspaceId, MAX_LISTED_LINKS + 1);
        if (flagged.length === 0) return null;
        const listed = flagged.slice(0, MAX_LISTED_LINKS);
        const { text, html } = renderBrokenLinksEmail({
          appName: this.deps.siteName,
          siteUrl: this.deps.siteUrl,
          workspaceName: workspace.name,
          reviewUrl: `${this.deps.siteUrl}/dashboard/links?health=attention`,
          settingsUrl: this.settingsUrl,
          links: listed.map((link) => ({
            code: link.code,
            title: link.title,
            destinationUrl: link.destinationUrl,
            reason: describeHealthReason(link.reason),
            failingTarget: link.failingTarget,
          })),
          more: flagged.length - listed.length,
        });
        const count = flagged.length;
        return {
          subject: oneLine(
            `${count > MAX_LISTED_LINKS ? `${MAX_LISTED_LINKS}+` : count} broken ${count === 1 ? "link" : "links"} in ${workspace.name}`,
          ),
          text,
          html,
        };
      });
    }
    return `${sent} broken-link emails sent for ${workspaceIds.length} workspaces`;
  }

  /** "Send me a preview": the report for the last seven days, to the person asking. Not recorded as a delivery. */
  async sendPreview(actor: Actor): Promise<void> {
    const user = requireUser(actor);
    if (!this.deps.mailer.isConfigured) {
      throw new ValidationError("Email is not set up on this instance, so no preview can be sent");
    }
    await this.deps.abuse.enforceRateLimit(`report:preview:${user.userId}`, RATE_LIMITS.reportPreview);
    const [person, workspace] = await Promise.all([
      this.deps.users.findById(user.userId),
      this.deps.workspaces.findById(user.workspace.id),
    ]);
    if (!person || !workspace) throw new NotFoundError("Workspace not found");

    const to = this.deps.clock.now();
    const from = new Date(to.getTime() - WEEK_MS);
    const report = await this.deps.clicks.workspaceReport(workspace.id, from, to);
    const { text, html } = renderWeeklyReportEmail({
      appName: this.deps.siteName,
      siteUrl: this.deps.siteUrl,
      workspaceName: workspace.name,
      periodLabel: periodLabel(from, to),
      dashboardUrl: this.dashboardUrl,
      settingsUrl: this.settingsUrl,
      report,
      countryName,
    });
    await this.deps.mailer.send({
      to: person.email,
      subject: oneLine(`Preview: your week on ${this.deps.siteName}: ${workspace.name}`),
      text,
      html,
    });
  }

  /** Owners and admins who have not opted out of this kind of email. */
  private async recipients(kind: Kind, workspaceId: string): Promise<WorkspaceMember[]> {
    const members = (await this.deps.workspaces.listMembers(workspaceId)).filter(
      (member) => member.role === "owner" || member.role === "admin",
    );
    const preferences = await this.deps.preferences.getMany(members.map((m) => m.userId));
    return members.filter((member) => {
      const preference = preferences.get(member.userId);
      return kind === "weekly_report" ? preference?.weeklyReport : preference?.brokenLinksEmail;
    });
  }

  /** Claims, builds (once), sends and records one workspace's emails. Returns how many were sent. */
  private async deliverToWorkspace(
    kind: Kind,
    workspaceId: string,
    periodKey: string,
    build: (workspace: Workspace) => Promise<Message | null>,
  ): Promise<number> {
    const { deliveries, mailer, clock, logger } = this.deps;
    const workspace = await this.deps.workspaces.findById(workspaceId);
    if (!workspace) return 0;
    const recipients = await this.recipients(kind, workspaceId);
    if (recipients.length === 0) return 0;

    let message: Message | null | undefined;
    let sent = 0;
    for (const recipient of recipients) {
      const key: DeliveryKey = { kind, workspaceId, userId: recipient.userId, periodKey };
      const now = clock.now();
      if (!(await deliveries.claim(key, now, new Date(now.getTime() - STALE_CLAIM_MS)))) continue;
      try {
        message ??= await build(workspace);
        if (!message) {
          // Nothing worth sending this week: forget the claim so a later change in the same window still can.
          await deliveries.release(key);
          continue;
        }
        await mailer.send({ to: recipient.email, ...message });
        await deliveries.markSent(key, clock.now());
        sent++;
      } catch (error) {
        logger.warn({ err: error, kind, workspaceId }, "Scheduled email failed; it will be retried");
        await deliveries.release(key).catch(() => undefined);
      }
    }
    return sent;
  }
}
