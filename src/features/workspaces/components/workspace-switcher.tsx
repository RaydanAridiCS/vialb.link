"use client";

import { Check, ChevronsUpDown, Settings2, User, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WORKSPACE_ROLE_LABELS, type WorkspaceRole } from "@/lib/permissions";
import { switchWorkspaceAction } from "../actions";

export interface WorkspaceOption {
  id: string;
  name: string;
  isPersonal: boolean;
  role: WorkspaceRole;
}

/** Picks which workspace the dashboard shows. Everything on screen follows it. */
export function WorkspaceSwitcher({
  current,
  options,
}: {
  current: WorkspaceOption;
  options: WorkspaceOption[];
}) {
  const router = useRouter();
  const switchTo = useAction(switchWorkspaceAction, {
    onSuccess: () => {
      // Pages for one workspace's links make no sense in another, so start from the overview.
      router.push("/dashboard");
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Could not switch workspace"),
  });

  const label = current.isPersonal ? "Personal" : current.name;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-[11rem] gap-1.5"
          aria-label={`Workspace: ${label}`}
          data-testid="workspace-switcher"
        >
          {current.isPersonal ? (
            <User className="size-4 shrink-0" aria-hidden />
          ) : (
            <Users className="size-4 shrink-0" aria-hidden />
          )}
          <span className="hidden truncate sm:inline">{label}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            disabled={switchTo.isPending}
            onSelect={() => {
              if (option.id !== current.id) switchTo.execute({ workspaceId: option.id });
            }}
            data-testid={`workspace-option-${option.isPersonal ? "personal" : option.name}`}
          >
            {option.isPersonal ? (
              <User className="size-4" aria-hidden />
            ) : (
              <Users className="size-4" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate">{option.isPersonal ? "Personal" : option.name}</span>
            <span className="text-xs text-muted-foreground">{WORKSPACE_ROLE_LABELS[option.role]}</span>
            {option.id === current.id ? <Check className="size-4" aria-label="Current" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/team">
            <Settings2 className="size-4" aria-hidden /> Teams and members
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
