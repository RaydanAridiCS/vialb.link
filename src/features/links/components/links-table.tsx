"use client";

import { createColumnHelper, rowSelectionFeature, tableFeatures, useTable } from "@tanstack/react-table";
import {
  BarChart3,
  Copy,
  Download,
  Link2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  QrCode,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import type { LinkDto, LinkStatus } from "@/server/services/dto";
import { deleteLinksAction, setLinksEnabledAction } from "../actions";
import { QrDialog } from "./qr-dialog";

const features = tableFeatures({ rowSelectionFeature });
const helper = createColumnHelper<typeof features, LinkDto>();

const STATUS_STYLES: Record<
  LinkStatus,
  { label: string; variant: "success" | "warning" | "secondary"; dot: string }
> = {
  active: { label: "Active", variant: "success", dot: "bg-success" },
  expired: { label: "Expired", variant: "warning", dot: "bg-warning" },
  limit_reached: { label: "Limit reached", variant: "warning", dot: "bg-warning" },
  disabled: { label: "Disabled", variant: "secondary", dot: "bg-muted-foreground" },
};

function toCsv(rows: LinkDto[]): string {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "code",
    "short_url",
    "destination_url",
    "title",
    "status",
    "clicks",
    "max_clicks",
    "expires_at",
    "has_password",
    "created_at",
  ];
  const lines = rows.map((r) =>
    [
      r.code,
      r.shortUrl,
      r.destinationUrl,
      r.title,
      r.status,
      r.clickCount,
      r.maxClicks,
      r.expiresAt,
      r.hasPassword,
      r.createdAt,
    ]
      .map(esc)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}

function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface LinksTableProps {
  links: LinkDto[];
  total: number;
  page: number;
  pageSize: number;
  admin?: boolean;
}

export function LinksTable({ links, total, page, pageSize, admin = false }: LinksTableProps) {
  const router = useRouter();
  const [qrLink, setQrLink] = useState<LinkDto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);

  const remove = useAction(deleteLinksAction, {
    onSuccess: ({ data }) => {
      toast.success(`Deleted ${data?.deleted ?? 0} link${data?.deleted === 1 ? "" : "s"}`);
      table.resetRowSelection();
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Could not delete"),
  });
  const toggle = useAction(setLinksEnabledAction, {
    onSuccess: () => {
      table.resetRowSelection();
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Could not update"),
  });

  const columns = useMemo(
    () =>
      helper.columns([
        helper.display({
          id: "select",
          header: ({ table: t }) => (
            <Checkbox
              aria-label="Select all links on this page"
              checked={
                t.getIsAllPageRowsSelected() ? true : t.getIsSomePageRowsSelected() ? "indeterminate" : false
              }
              onCheckedChange={(v) => t.toggleAllPageRowsSelected(v === true)}
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              aria-label={`Select /${row.original.code}`}
              checked={row.getIsSelected()}
              onCheckedChange={(v) => row.toggleSelected(v === true)}
            />
          ),
        }),
        helper.display({
          id: "link",
          header: "Link",
          cell: ({ row }) => {
            const link = row.original;
            return (
              <div className="max-w-[24rem] min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Link href={`/dashboard/links/${link.id}`} className="truncate font-medium hover:underline">
                    {link.title ?? `/${link.code}`}
                  </Link>
                  {link.hasPassword ? (
                    <Lock
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label="Password protected"
                    />
                  ) : null}
                  {admin && link.ownerId === null ? <Badge variant="outline">anonymous</Badge> : null}
                </div>
                <a
                  href={link.shortUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block max-w-full truncate rounded-md bg-accent px-1.5 py-0.5 font-mono text-xs text-accent-foreground hover:underline"
                >
                  {link.shortUrl.replace(/^https?:\/\//, "")}
                </a>
                <p className="truncate text-xs text-muted-foreground" title={link.destinationUrl}>
                  {link.destinationUrl}
                </p>
              </div>
            );
          },
        }),
        helper.display({
          id: "status",
          header: "Status",
          cell: ({ row }) => {
            const s = STATUS_STYLES[row.original.status];
            return (
              <Badge variant={s.variant}>
                <span aria-hidden className={`size-1.5 rounded-full ${s.dot}`} />
                {s.label}
              </Badge>
            );
          },
        }),
        helper.display({
          id: "clicks",
          header: "Clicks",
          cell: ({ row }) => (
            <span className="font-mono text-sm tabular-nums">
              {formatNumber(row.original.clickCount)}
              {row.original.maxClicks !== null ? (
                <span className="text-muted-foreground"> / {formatNumber(row.original.maxClicks)}</span>
              ) : null}
            </span>
          ),
        }),
        helper.display({
          id: "created",
          header: "Created",
          cell: ({ row }) => (
            <span className="text-sm whitespace-nowrap text-muted-foreground">
              {formatDate(row.original.createdAt)}
            </span>
          ),
        }),
        helper.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => {
            const link = row.original;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for /${link.code}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() =>
                      navigator.clipboard.writeText(link.shortUrl).then(
                        () => toast.success("Copied to clipboard"),
                        () => toast.error("Could not access the clipboard"),
                      )
                    }
                  >
                    <Copy className="size-4" /> Copy short link
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setQrLink(link)}>
                    <QrCode className="size-4" /> QR code
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/links/${link.id}`}>
                      <BarChart3 className="size-4" /> Analytics
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/links/${link.id}/edit`}>
                      <Pencil className="size-4" /> Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => toggle.execute({ ids: [link.id], enabled: !link.isEnabled })}
                  >
                    <Power className="size-4" /> {link.isEnabled ? "Disable" : "Enable"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete([link.id])}>
                    <Trash2 className="size-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          },
        }),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- action executors are stable
    [admin],
  );

  const table = useTable({ features, columns, data: links, getRowId: (row) => row.id });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);

  return (
    <div className="space-y-4">
      <Toolbar />

      {selected.length > 0 ? (
        <div
          className="flex animate-in flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-accent/60 px-3 py-2 text-sm fade-in slide-in-from-top-1"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="font-medium">{selected.length} selected</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toggle.execute({ ids: selected.map((l) => l.id), enabled: false })}
          >
            <Power className="size-4" /> Disable
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => toggle.execute({ ids: selected.map((l) => l.id), enabled: true })}
          >
            Enable
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadText(toCsv(selected), `links-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv")
            }
          >
            <Download className="size-4" /> Export CSV
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(selected.map((l) => l.id))}>
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      ) : null}

      <div className="relative overflow-x-auto rounded-2xl border bg-card shadow-paper">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} className={header.column.id === "select" ? "w-10" : undefined}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-64 text-center">
                  <EmptyState />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  data-testid="link-row"
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3.5 align-top">
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination total={total} page={page} pageSize={pageSize} />

      <QrDialog link={qrLink} open={qrLink !== null} onOpenChange={(open) => !open && setQrLink(null)} />

      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmDelete?.length === 1 ? "this link" : `${confirmDelete?.length ?? 0} links`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deleted links stop working immediately. Their short codes stay reserved and can&apos;t be
              reused.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) remove.execute({ ids: confirmDelete });
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  return { searchParams, set, pending };
}

function Toolbar() {
  const { searchParams, set, pending } = useUrlParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      if ((searchParams.get("q") ?? "") !== query) set({ q: query });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center" aria-busy={pending}>
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          aria-label="Search links"
          placeholder="Search by code, title or destination…"
          className="h-10 rounded-xl pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Select
        value={searchParams.get("status") ?? "all"}
        onValueChange={(v) => set({ status: v === "all" ? null : v })}
      >
        <SelectTrigger className="w-full data-[size=default]:h-10 sm:w-44" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="expired">Expired or at limit</SelectItem>
          <SelectItem value="disabled">Disabled</SelectItem>
          <SelectItem value="protected">Password protected</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={searchParams.get("sort") ?? "created_desc"}
        onValueChange={(v) => set({ sort: v === "created_desc" ? null : v })}
      >
        <SelectTrigger className="w-full data-[size=default]:h-10 sm:w-44" aria-label="Sort links">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="created_desc">Newest first</SelectItem>
          <SelectItem value="created_asc">Oldest first</SelectItem>
          <SelectItem value="clicks_desc">Most clicks</SelectItem>
          <SelectItem value="clicks_asc">Fewest clicks</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function Pagination({ total, page, pageSize }: { total: number; page: number; pageSize: number }) {
  const { set } = useUrlParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-2 text-sm text-muted-foreground"
    >
      <span>
        {from}–{to} of {formatNumber(total)}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => set({ page: String(page - 1) })}
        >
          Previous
        </Button>
        <span aria-current="page">
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => set({ page: String(page + 1) })}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

function EmptyState() {
  const searchParams = useSearchParams();
  const filtered = searchParams.has("q") || searchParams.has("status");
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-muted-foreground">
      <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
        {filtered ? <Search className="size-5" aria-hidden /> : <Link2 className="size-5" aria-hidden />}
      </span>
      <p className="font-display text-2xl text-foreground">{filtered ? "Nothing found" : "No links yet"}</p>
      <p>{filtered ? "No links match these filters." : "You haven't created any links yet."}</p>
      {filtered ? null : (
        <Button size="sm" asChild>
          <Link href="/dashboard/links/new">
            <Plus className="size-4" /> Create your first link
          </Link>
        </Button>
      )}
    </div>
  );
}
