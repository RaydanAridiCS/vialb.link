"use client";

import { Loader2, Mail, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import {
  assignableRoles,
  can,
  canManageMember,
  WORKSPACE_ROLE_DESCRIPTIONS,
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from "@/lib/permissions";
import {
  changeRoleAction,
  deleteWorkspaceAction,
  inviteMemberAction,
  leaveWorkspaceAction,
  removeMemberAction,
  renameWorkspaceAction,
  revokeInviteAction,
} from "../actions";

export interface TeamMemberView {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
}

export interface TeamInviteView {
  id: string;
  email: string;
  role: WorkspaceRole;
  expiresAt: string;
}

export interface TeamManagerProps {
  workspace: { id: string; name: string; role: WorkspaceRole };
  members: TeamMemberView[];
  invites: TeamInviteView[];
  currentUserId: string;
}

function messageOf(error: { serverError?: string }, fallback: string) {
  return error.serverError ?? fallback;
}

/** Members, invitations and settings of the team being shown. What a person sees depends on their role. */
export function TeamManager({ workspace, members, invites, currentUserId }: TeamManagerProps) {
  const router = useRouter();
  const done = (message: string) => () => {
    toast.success(message);
    router.refresh();
  };
  const failed =
    (fallback: string) =>
    ({ error }: { error: { serverError?: string } }) =>
      toast.error(messageOf(error, fallback));

  const canInvite = can(workspace.role, "members:manage");
  const canRename = can(workspace.role, "workspace:update");
  const canDelete = can(workspace.role, "workspace:delete");

  const rename = useAction(renameWorkspaceAction, {
    onSuccess: done("Team renamed"),
    onError: failed("Could not rename the team"),
  });
  const changeRole = useAction(changeRoleAction, {
    onSuccess: done("Role updated"),
    onError: failed("Could not change the role"),
  });
  const remove = useAction(removeMemberAction, {
    onSuccess: done("Member removed"),
    onError: failed("Could not remove the member"),
  });
  const revoke = useAction(revokeInviteAction, {
    onSuccess: done("Invitation cancelled"),
    onError: failed("Could not cancel the invitation"),
  });
  const leave = useAction(leaveWorkspaceAction, {
    onSuccess: () => {
      toast.success("You left the team");
      router.push("/dashboard");
      router.refresh();
    },
    onError: failed("Could not leave the team"),
  });
  const deleteTeam = useAction(deleteWorkspaceAction, {
    onSuccess: () => {
      toast.success("Team deleted");
      router.push("/dashboard");
      router.refresh();
    },
    onError: failed("Could not delete the team"),
  });

  const [name, setName] = useState(workspace.name);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("editor");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; url: string; emailSent: boolean } | null>(null);
  const invite = useAction(inviteMemberAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      setSent({ email: data.email, url: data.url, emailSent: data.emailSent });
      setInviteEmail("");
      router.refresh();
    },
    onError: ({ error }) => {
      setSent(null);
      setInviteError(
        error.validationErrors?.email?._errors?.[0] ?? messageOf(error, "Could not send the invitation"),
      );
    },
  });

  const roles = assignableRoles(workspace.role);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">{workspace.name}</CardTitle>
          <CardDescription>
            You are {workspace.role === "admin" ? "an" : "a"}{" "}
            <strong>{WORKSPACE_ROLE_LABELS[workspace.role]}</strong>.{" "}
            {WORKSPACE_ROLE_DESCRIPTIONS[workspace.role]}
          </CardDescription>
        </CardHeader>
        {canRename ? (
          <CardContent>
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                rename.execute({ workspaceId: workspace.id, name });
              }}
            >
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="team-name">Team name</Label>
                <Input id="team-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <Button
                type="submit"
                variant="outline"
                disabled={rename.isPending || name.trim() === workspace.name}
              >
                {rename.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Rename
              </Button>
            </form>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Members</CardTitle>
          <CardDescription>
            Everyone here sees this team&apos;s links. Removing someone never deletes the links they made.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden sm:table-cell">Joined</TableHead>
                <TableHead className="w-24 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isMe = member.userId === currentUserId;
                const manageable = canManageMember(workspace.role, member.role);
                return (
                  <TableRow key={member.userId} data-testid={`member-${member.email}`}>
                    <TableCell>
                      <div className="font-medium">
                        {member.name} {isMe ? <span className="text-muted-foreground">(you)</span> : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{member.email}</div>
                    </TableCell>
                    <TableCell>
                      {manageable ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            changeRole.execute({
                              workspaceId: workspace.id,
                              userId: member.userId,
                              role: role as WorkspaceRole,
                            })
                          }
                        >
                          <SelectTrigger className="w-32" aria-label={`Role for ${member.email}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map((role) => (
                              <SelectItem key={role} value={role}>
                                {WORKSPACE_ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">{WORKSPACE_ROLE_LABELS[member.role]}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {formatDate(member.joinedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {manageable && !isMe ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${member.email}`}
                          disabled={remove.isPending}
                          onClick={() => remove.execute({ workspaceId: workspace.id, userId: member.userId })}
                        >
                          <Trash2 className="size-4" aria-hidden /> Remove
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Invite people</CardTitle>
            <CardDescription>
              They need an account with the same email address. The link works for 7 days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
              onSubmit={(event) => {
                event.preventDefault();
                setInviteError(null);
                setSent(null);
                invite.execute({ workspaceId: workspace.id, email: inviteEmail, role: inviteRole });
              }}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  value={inviteEmail}
                  placeholder="teammate@example.com"
                  onChange={(event) => setInviteEmail(event.target.value)}
                  aria-invalid={inviteError ? true : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={inviteRole} onValueChange={(role) => setInviteRole(role as WorkspaceRole)}>
                  <SelectTrigger id="invite-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {WORKSPACE_ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mail className="size-4" aria-hidden />
                )}
                Send invitation
              </Button>
            </form>
            {inviteError ? (
              <p role="alert" className="text-sm text-destructive">
                {inviteError}
              </p>
            ) : null}
            {sent ? (
              <div
                className="space-y-2 rounded-lg border bg-muted/40 p-3"
                role="status"
                data-testid="invite-result"
              >
                <p className="text-sm">
                  {sent.emailSent
                    ? `We emailed ${sent.email}. You can also share this link yourself:`
                    : `Email isn't set up on this instance, so share this link with ${sent.email} yourself:`}
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={sent.url}
                    aria-label="Invitation link"
                    className="font-mono text-xs"
                  />
                  <CopyButton value={sent.url} />
                </div>
              </div>
            ) : null}

            {invites.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-medium">Waiting to join</h3>
                <ul className="divide-y rounded-lg border">
                  {invites.map((pending) => (
                    <li
                      key={pending.id}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                      data-testid={`invite-${pending.email}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">{pending.email}</div>
                        <div className="text-xs text-muted-foreground">
                          {WORKSPACE_ROLE_LABELS[pending.role]} · expires {formatDate(pending.expiresAt)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Cancel invitation for ${pending.email}`}
                        disabled={revoke.isPending}
                        onClick={() => revoke.execute({ workspaceId: workspace.id, inviteId: pending.id })}
                      >
                        Cancel
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="font-display text-xl">Leave or delete</CardTitle>
          <CardDescription>
            Leaving keeps the team&apos;s links where they are. Deleting removes the team, its links and their
            analytics for everyone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Leave team</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave {workspace.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will lose access to this team&apos;s links. The only way back is a new invitation.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Stay</AlertDialogCancel>
                <AlertDialogAction onClick={() => leave.execute({ workspaceId: workspace.id })}>
                  Leave
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {canDelete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Delete team</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {workspace.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes the team, every link in it and all of their analytics, for all{" "}
                    {members.length} member{members.length === 1 ? "" : "s"}. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => deleteTeam.execute({ workspaceId: workspace.id })}
                  >
                    Delete forever
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
