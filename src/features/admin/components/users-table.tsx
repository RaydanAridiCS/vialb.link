"use client";

import { MoreHorizontal, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { banUserAction, setUserRoleAction, unbanUserAction } from "../actions";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  createdAt: string;
  twoFactorEnabled: boolean | null;
}

export function UsersTable({
  users,
  total,
  page,
  pageSize,
  currentUserId,
}: {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
  currentUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const callbacks = {
    onSuccess: () => {
      toast.success("User updated");
      router.refresh();
    },
    onError: ({ error }: { error: { serverError?: string } }) =>
      toast.error(error.serverError ?? "Action failed"),
  };
  const ban = useAction(banUserAction, callbacks);
  const unban = useAction(unbanUserAction, callbacks);
  const setRole = useAction(setUserRoleAction, callbacks);

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next}`);
  };
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <form
        className="relative max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: query.trim() || null, page: null });
        }}
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Search users by email"
          placeholder="Search by email…"
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : "outline"}>
                      {user.role ?? "user"}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-1">
                    {user.banned ? (
                      <Badge variant="destructive">banned</Badge>
                    ) : (
                      <Badge variant="secondary">active</Badge>
                    )}
                    {user.twoFactorEnabled ? <Badge variant="outline">2FA</Badge> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    {user.id === currentUserId ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${user.email}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {user.role === "admin" ? (
                            <DropdownMenuItem
                              onSelect={() => setRole.execute({ userId: user.id, role: "user" })}
                            >
                              Make regular user
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() => setRole.execute({ userId: user.id, role: "admin" })}
                            >
                              Make admin
                            </DropdownMenuItem>
                          )}
                          {user.banned ? (
                            <DropdownMenuItem onSelect={() => unban.execute({ userId: user.id })}>
                              Unban
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => ban.execute({ userId: user.id })}
                            >
                              Ban user
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <nav
        aria-label="Pagination"
        className="flex items-center justify-end gap-2 text-sm text-muted-foreground"
      >
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => go({ page: String(page - 1) })}
        >
          Previous
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => go({ page: String(page + 1) })}
        >
          Next
        </Button>
      </nav>
    </div>
  );
}
