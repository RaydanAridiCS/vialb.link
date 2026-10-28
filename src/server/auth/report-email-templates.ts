/**
 * HTML and plain-text bodies for the scheduled emails (weekly report, broken links). Same table-and-inline-
 * style approach and brand colours as the account emails in `email-templates.ts`, but they share one small
 * shell instead of repeating the markup. Every dynamic value is escaped.
 */
import type { WorkspaceReport } from "@/server/domain/types";
import { escapeHtml } from "@/server/lib/html";

interface ShellProps {
  appName: string;
  siteUrl: string;
  title: string;
  /** Trusted HTML built from escaped parts. */
  bodyHtml: string;
  footerHtml: string;
}

function renderShell({ appName, siteUrl, title, bodyHtml, footerHtml }: ShellProps): string {
  const app = escapeHtml(appName);
  const initial = escapeHtml(appName.charAt(0).toUpperCase());
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: #f7f6f3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #e7e5e0; overflow: hidden;" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding: 32px 36px 12px 36px;">
              <span style="display: inline-block; width: 38px; height: 38px; background-color: #166534; border-radius: 10px; text-align: center; line-height: 38px; color: #ffffff; font-size: 20px; font-weight: bold;">${initial}</span>
              <span style="font-size: 19px; font-weight: 700; color: #0f172a; margin-left: 12px; vertical-align: middle;">${app}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 36px 32px 36px;">
${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding: 18px 36px; background-color: #fafaf9; border-top: 1px solid #e7e5e0; text-align: center; font-size: 12px; line-height: 1.6; color: #94a3b8;">
${footerHtml}
              <br><a href="${escapeHtml(siteUrl)}" style="color: #64748b; text-decoration: underline;">${escapeHtml(siteUrl)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0 8px 0;"><tr><td align="left" style="border-radius: 8px; background-color: #166534;"><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 24px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; background-color: #166534;">${escapeHtml(label)}</a></td></tr></table>`;
}

function heading(text: string): string {
  return `<h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">${escapeHtml(text)}</h1>`;
}

function sectionTitle(text: string): string {
  return `<h2 style="margin: 24px 0 8px 0; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b;">${escapeHtml(text)}</h2>`;
}

const numberFormat = new Intl.NumberFormat("en");

/** `+12%`, `-8%`, `new` when there was nothing to compare with, `no change` for equal. */
export function describeChange(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "no change" : "new";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "no change";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function changeColor(current: number, previous: number): string {
  if (current === previous) return "#64748b";
  return current > previous ? "#166534" : "#b91c1c";
}

function footerFor(workspaceName: string, settingsUrl: string): string {
  return `You get this because you are an owner or admin of &ldquo;${escapeHtml(workspaceName)}&rdquo;.<br><a href="${escapeHtml(settingsUrl)}" style="color: #64748b; text-decoration: underline;">Turn it off in your settings</a>`;
}

export interface WeeklyReportEmailProps {
  appName: string;
  siteUrl: string;
  workspaceName: string;
  /** e.g. "May 25 – Jun 1, 2026". */
  periodLabel: string;
  dashboardUrl: string;
  settingsUrl: string;
  report: WorkspaceReport;
  /** Turns a country code into a name; defaults to the code itself. */
  countryName?: (code: string) => string;
}

export function renderWeeklyReportEmail({
  appName,
  siteUrl,
  workspaceName,
  periodLabel,
  dashboardUrl,
  settingsUrl,
  report,
  countryName = (code) => code,
}: WeeklyReportEmailProps): { text: string; html: string } {
  const n = (value: number) => numberFormat.format(value);
  const change = describeChange(report.clicks, report.previousClicks);
  const label = (link: WorkspaceReport["topLinks"][number]) => link.title ?? `/${link.code}`;
  const country = (value: string) => (value === "Unknown" ? value : countryName(value));

  const text = [
    `Your week on ${appName}: ${workspaceName}`,
    periodLabel,
    "",
    `Clicks: ${n(report.clicks)} (${change} vs the week before: ${n(report.previousClicks)})`,
    `Unique visitors: ${n(report.uniqueVisitors)} (counted once per day)`,
    "",
    "Top links",
    ...(report.topLinks.length === 0
      ? ["  none"]
      : report.topLinks.map(
          (link, i) =>
            `  ${i + 1}. ${label(link)}: ${n(link.clicks)} (${describeChange(link.clicks, link.previousClicks)})`,
        )),
    "",
    "Top referrers",
    ...(report.topReferrers.length === 0
      ? ["  none"]
      : report.topReferrers.map((row) => `  ${row.value}: ${n(row.clicks)}`)),
    "",
    "Top countries",
    ...(report.topCountries.length === 0
      ? ["  none"]
      : report.topCountries.map((row) => `  ${country(row.value)}: ${n(row.clicks)}`)),
    "",
    `Open the dashboard: ${dashboardUrl}`,
    "",
    `You get this because you are an owner or admin of "${workspaceName}". Turn it off in your settings: ${settingsUrl}`,
    siteUrl,
  ].join("\n");

  const listRows = (rows: { left: string; right: string }[]) =>
    rows.length === 0
      ? `<p style="margin: 0; font-size: 14px; color: #64748b;">Nothing this week.</p>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size: 14px;">${rows
          .map(
            (row) =>
              `<tr><td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; color: #0f172a; word-break: break-all;">${row.left}</td><td align="right" style="padding: 6px 0 6px 12px; border-bottom: 1px solid #f1f5f9; white-space: nowrap;">${row.right}</td></tr>`,
          )
          .join("")}</table>`;

  const bodyHtml = `${heading(`Your week: ${workspaceName}`)}
<p style="margin: 0 0 16px 0; font-size: 14px; color: #64748b;">${escapeHtml(periodLabel)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="padding: 14px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;" width="50%">
    <div style="font-size: 12px; color: #64748b;">Clicks</div>
    <div style="font-size: 28px; font-weight: 700; color: #0f172a;">${n(report.clicks)}</div>
    <div style="font-size: 13px; color: ${changeColor(report.clicks, report.previousClicks)};">${escapeHtml(change)} vs last week (${n(report.previousClicks)})</div>
  </td>
  <td width="12"></td>
  <td style="padding: 14px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;" width="50%">
    <div style="font-size: 12px; color: #64748b;">Unique visitors</div>
    <div style="font-size: 28px; font-weight: 700; color: #0f172a;">${n(report.uniqueVisitors)}</div>
    <div style="font-size: 13px; color: #64748b;">counted once per day</div>
  </td>
</tr></table>
${sectionTitle("Top links")}
${listRows(
  report.topLinks.map((link) => ({
    left: escapeHtml(label(link)),
    right: `<strong>${n(link.clicks)}</strong> <span style="color: ${changeColor(link.clicks, link.previousClicks)};">${escapeHtml(describeChange(link.clicks, link.previousClicks))}</span>`,
  })),
)}
${sectionTitle("Top referrers")}
${listRows(report.topReferrers.map((row) => ({ left: escapeHtml(row.value), right: `<strong>${n(row.clicks)}</strong>` })))}
${sectionTitle("Top countries")}
${listRows(report.topCountries.map((row) => ({ left: escapeHtml(country(row.value)), right: `<strong>${n(row.clicks)}</strong>` })))}
${button(dashboardUrl, "Open dashboard")}`;

  return {
    text,
    html: renderShell({
      appName,
      siteUrl,
      title: `Your week on ${appName}`,
      bodyHtml,
      footerHtml: footerFor(workspaceName, settingsUrl),
    }),
  };
}

export interface BrokenLinksEmailProps {
  appName: string;
  siteUrl: string;
  workspaceName: string;
  reviewUrl: string;
  settingsUrl: string;
  links: {
    code: string;
    title: string | null;
    destinationUrl: string;
    reason: string;
    failingTarget: string | null;
  }[];
  /** How many more are not listed. */
  more: number;
}

export function renderBrokenLinksEmail({
  appName,
  siteUrl,
  workspaceName,
  reviewUrl,
  settingsUrl,
  links,
  more,
}: BrokenLinksEmailProps): { text: string; html: string } {
  const count = links.length + more;
  const noun = count === 1 ? "link needs" : "links need";
  const target = (link: BrokenLinksEmailProps["links"][number]) =>
    link.failingTarget && link.failingTarget !== link.destinationUrl
      ? link.failingTarget
      : link.destinationUrl;

  const text = [
    `${count} ${noun} attention in "${workspaceName}"`,
    "",
    "These links point somewhere that stopped working:",
    "",
    ...links.flatMap((link) => [
      `  /${link.code}${link.title ? ` (${link.title})` : ""}`,
      `    ${link.reason}`,
      `    ${target(link)}`,
      "",
    ]),
    ...(more > 0 ? [`  ...and ${more} more.`, ""] : []),
    `Review them: ${reviewUrl}`,
    "",
    `You get this because you are an owner or admin of "${workspaceName}". Turn it off in your settings: ${settingsUrl}`,
    siteUrl,
  ].join("\n");

  const items = links
    .map(
      (link) =>
        `<tr><td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;"><div style="font-size: 14px; font-weight: 600; color: #0f172a;">/${escapeHtml(link.code)}${link.title ? ` <span style="font-weight: 400; color: #64748b;">${escapeHtml(link.title)}</span>` : ""}</div><div style="font-size: 13px; color: #b91c1c;">${escapeHtml(link.reason)}</div><div style="font-size: 12px; color: #64748b; word-break: break-all;">${escapeHtml(target(link))}</div></td></tr>`,
    )
    .join("");

  const bodyHtml = `${heading(`${count} ${noun} attention`)}
<p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6; color: #334155;">These links in <strong>${escapeHtml(workspaceName)}</strong> point somewhere that stopped working. Visitors who open them may see an error.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>
${more > 0 ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #64748b;">&hellip;and ${more} more.</p>` : ""}
${button(reviewUrl, "Review these links")}`;

  return {
    text,
    html: renderShell({
      appName,
      siteUrl,
      title: `${count} ${noun} attention`,
      bodyHtml,
      footerHtml: footerFor(workspaceName, settingsUrl),
    }),
  };
}
