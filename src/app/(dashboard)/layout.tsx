import { AppShell } from "@/components/app-shell";
import { ClaimLinks } from "@/features/links/components/claim-links";
import { requireSession } from "@/server/auth/session";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const { session, actor } = await requireSession();
  const isAdmin = actor.role === "admin";
  const items = [
    { href: "/dashboard", label: "Overview", exact: true },
    { href: "/dashboard/links", label: "Links" },
    { href: "/dashboard/settings", label: "Settings" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <AppShell
      user={{ name: session.user.name, email: session.user.email, isAdmin }}
      items={items}
      showNewLink
    >
      <ClaimLinks />
      {children}
    </AppShell>
  );
}
