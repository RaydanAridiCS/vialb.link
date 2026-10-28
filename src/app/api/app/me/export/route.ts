import { APP_NAME } from "@/lib/constants";
import { getSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { withSession } from "@/server/http/session-route";

/** "Export my data": profile, links and API key metadata as JSON (GDPR-style portability). */
export const GET = withSession<Record<string, never>>(async (_request, actor) => {
  const session = await getSession();
  const { links, apiKeys, workspaces, reports } = getContainer();
  const [allLinks, keys, memberships, emailSettings] = await Promise.all([
    links.exportForUser(actor),
    apiKeys.listAll(actor),
    workspaces.exportMemberships(actor.userId),
    reports.emailSettings(actor),
  ]);
  const body = {
    exportedAt: new Date().toISOString(),
    application: APP_NAME,
    user: session
      ? {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          createdAt: session.user.createdAt,
          twoFactorEnabled: session.user.twoFactorEnabled ?? false,
        }
      : null,
    workspaces: memberships,
    emailPreferences: {
      weeklyReport: emailSettings.preferences.weeklyReport,
      brokenLinksEmail: emailSettings.preferences.brokenLinksEmail,
    },
    links: allLinks,
    apiKeys: keys,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${APP_NAME.toLowerCase()}-export.json"`,
      "Cache-Control": "private, no-store",
    },
  });
});
