import { AppShell } from "@/components/app-shell";
import { requireAdminSession } from "@/server/auth/session";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const { session } = await requireAdminSession();
  return (
    <AppShell
      user={{ name: session.user.name, email: session.user.email, isAdmin: true }}
      items={[
        { href: "/admin", label: "Instance", exact: true },
        { href: "/admin/users", label: "Users" },
        { href: "/admin/links", label: "All links" },
        { href: "/dashboard", label: "← My dashboard", exact: true },
      ]}
    >
      {children}
    </AppShell>
  );
}
