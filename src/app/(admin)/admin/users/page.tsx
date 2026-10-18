import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell";
import { UsersTable, type AdminUserRow } from "@/features/admin/components/users-table";
import { auth } from "@/server/auth/auth";
import { requireAdminSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 25;

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const { session } = await requireAdminSession();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : 1) || 1);

  const result = await auth.api.listUsers({
    query: {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      sortBy: "createdAt",
      sortDirection: "desc",
      ...(q ? { searchValue: q, searchField: "email" as const, searchOperator: "contains" as const } : {}),
    },
    headers: await headers(),
  });

  const users: AdminUserRow[] = result.users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role ?? null,
    banned: u.banned ?? null,
    createdAt: new Date(u.createdAt).toISOString(),
    twoFactorEnabled: (u as { twoFactorEnabled?: boolean | null }).twoFactorEnabled ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Promote admins and ban abusive accounts. Banned users are signed out and their API keys stop working."
      />
      <Suspense>
        <UsersTable
          users={users}
          total={result.total}
          page={page}
          pageSize={PAGE_SIZE}
          currentUserId={session.user.id}
        />
      </Suspense>
    </>
  );
}
