import { AppShell } from "@/components/app-shell";
import { ClaimLinks } from "@/features/links/components/claim-links";
import { PendingInvite } from "@/features/workspaces/components/pending-invite";
import { can } from "@/lib/permissions";
import { requireSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const { session, actor } = await requireSession();
  const isAdmin = actor.role === "admin";
  const mine = await getContainer().workspaces.listMine(actor);
  const options = mine.map(({ id, name, isPersonal, role }) => ({ id, name, isPersonal, role }));
  const current = options.find((option) => option.id === actor.workspace.id) ?? options[0];
  const items = [
    { href: "/dashboard", label: "Overview", exact: true },
    { href: "/dashboard/links", label: "Links" },
    { href: "/dashboard/bio", label: "Bio page" },
    { href: "/dashboard/team", label: "Teams" },
    { href: "/dashboard/settings", label: "Settings" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <AppShell
      user={{ name: session.user.name, email: session.user.email, isAdmin }}
      items={items}
      showNewLink={can(actor.workspace.role, "link:write")}
      workspace={current ? { current, options } : undefined}
    >
      <ClaimLinks />
      <PendingInvite />
      {children}
    </AppShell>
  );
}
