import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateWorkspaceForm } from "@/features/workspaces/components/create-workspace-form";
import { TeamManager } from "@/features/workspaces/components/team-manager";
import { WORKSPACE_ROLE_LABELS } from "@/lib/permissions";
import { requireSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Teams" };

export default async function TeamPage() {
  const { actor } = await requireSession();
  const { workspaces } = getContainer();
  const mine = await workspaces.listMine(actor);
  const active = mine.find((workspace) => workspace.id === actor.workspace.id);
  const details = active && !active.isPersonal ? await workspaces.members(actor, active.id) : null;

  return (
    <>
      <PageHeader
        title="Teams"
        description="Share links, analytics and API keys with other people. Use the workspace menu in the header to switch between your personal space and your teams."
      />
      <div className="space-y-6">
        {details ? (
          <TeamManager
            workspace={{
              id: details.workspace.id,
              name: details.workspace.name,
              role: details.workspace.role,
            }}
            members={details.members.map((member) => ({
              userId: member.userId,
              name: member.name,
              email: member.email,
              role: member.role,
              joinedAt: member.joinedAt.toISOString(),
            }))}
            invites={details.invites.map((invite) => ({
              id: invite.id,
              email: invite.email,
              role: invite.role,
              expiresAt: invite.expiresAt.toISOString(),
            }))}
            currentUserId={actor.userId}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl">You are in your personal workspace</CardTitle>
              <CardDescription>
                Only you can see it. Create a team to work on links together, or switch to a team you belong
                to from the workspace menu.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Your workspaces</CardTitle>
            <CardDescription>Switch with the workspace menu in the header.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border" data-testid="workspace-list">
              {mine.map((workspace) => (
                <li key={workspace.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {workspace.isPersonal ? "Personal" : workspace.name}
                      {workspace.id === actor.workspace.id ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">showing now</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {workspace.isPersonal
                        ? "Just you"
                        : `${workspace.memberCount} member${workspace.memberCount === 1 ? "" : "s"}`}
                    </div>
                  </div>
                  <Badge variant="secondary">{WORKSPACE_ROLE_LABELS[workspace.role]}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Create a team</CardTitle>
            <CardDescription>
              You become its owner. Links in a team belong to the team, so they stay when someone leaves.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateWorkspaceForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
