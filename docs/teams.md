# Teams and workspaces

A **workspace** is a shared space for links, their analytics and API keys. Everyone has a **personal**
workspace (just them); a **team** is an extra workspace with several people in it. Use the workspace menu in
the header to switch, and **Teams** in the navigation to create a team, invite people and manage roles.

Links belong to the workspace, not to the person who made them. When someone leaves a team, the links they
created stay with the team.

## Roles

| Role       | Can do                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------- |
| **Viewer** | See the team's links, their analytics and QR codes. Change nothing.                                 |
| **Editor** | Everything a viewer can, plus create, edit, enable, disable, delete and import links.               |
| **Admin**  | Everything an editor can, plus rename the team, invite people, and manage editors and viewers.      |
| **Owner**  | Everything, including making other owners, managing admins and owners, and deleting the whole team. |

Rules that keep a team from locking itself out (all enforced on the server, and tested):

- A team always has **at least one owner**. The last owner cannot be demoted, removed or leave; even two owners
  stepping down at the same moment cannot both succeed (the change is serialised in the database).
- An **admin** can only manage and invite editors and viewers. They cannot touch an owner or another admin, and
  cannot hand out those roles.
- Nobody can raise their own role.
- Someone who is not a member gets "not found", not "forbidden", so workspace ids cannot be probed.
- Your role is read from the database **on every request**. Removing someone takes effect immediately, even
  with the old browser tab still open: their next request falls back to their personal workspace.

The instance **administrator** is separate and unchanged: they can still see and manage every link for abuse
handling.

## Inviting people

Owners and admins enter an email address and a role. The person receives a link (`/invite/<token>`) that works
for **7 days**.

- The invitation is **tied to that email address**. The person must sign in (or sign up) with the same address,
  so a forwarded link is useless to anyone else.
- With SMTP configured, the link is emailed. Without it (or if sending fails) the dashboard shows the link so
  the inviter can send it themselves. The link is always shown to the inviter either way.
- Inviting an address again **replaces** the pending invitation, which stops the old link from working.
- Pending invitations can be cancelled. A person who opens a link before they have an account is offered it
  again on their dashboard right after signing up.
- Only a **hash** of the token is stored. Limits: 50 members plus pending invitations per team, 30 invitations
  per hour per person, 20 accept attempts per hour.

## Which workspace is showing

The dashboard shows one workspace at a time, remembered in a cookie (`vialb_ws`). The cookie is only a
preference: it is checked against your memberships on every request, and an id you do not belong to is ignored.
Switching sends you to the overview, because a page about one workspace's link makes no sense in another.

A link from another workspace is out of reach even if you own both: open it from the workspace it belongs to.

**API keys** act in the workspace they were created in, with your role there. If you leave the workspace, the key
stops working. The keys page lists the keys of the workspace being shown.

**Bio pages stay personal.** Your `/@handle` page and its buttons belong to you whichever workspace is showing.

## Accounts, leaving and deleting

- **Leave** a team from its page. Your links stay with the team.
- **Delete a team** (owners only) removes the team, its links and their analytics for everyone, after a
  confirmation.
- **Deleting your account** is refused while you are the **only owner** of a team that has other members: make
  someone else an owner (or delete the team) first. Teams only you belong to are deleted with your account, and
  you leave the others. Your personal workspace and everything in it is deleted.
- **Export my data** now includes a `workspaces` list (name, whether it is personal, your role).

## Upgrading

Migration `0007_workspaces` gives every existing user a personal workspace and moves their links and API keys
into it, so nothing changes for people who never use a team. Links created without an account still wait for
their claim token (and land in the workspace being shown when claimed).

`links.user_id` now means "created by" and becomes empty if that person's account is deleted; ownership is
`links.workspace_id`.

## REST API

No new endpoints. A key acts in its workspace, so `GET /api/v1/links` lists that workspace's links, and a
**viewer's** key can read but gets `403` when it creates, changes or deletes.

## Not included (yet)

- Per-workspace settings (default QR colours, domain blocklists) and billing.
- Moving links between workspaces.
- Team-wide bio pages, audit logs, SSO and SCIM.
- Seeing a person's workspaces in the admin user list.

## Implementation map

| Part                         | Where                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Roles and permissions        | `src/lib/permissions.ts` (one table, used by the server and the screens)                                                                                           |
| Tables and migration         | `src/server/db/schema/workspaces.ts`, `links.workspace_id`, `api_keys.workspace_id`, `0007_workspaces.sql`                                                         |
| Repository (+ in-memory)     | `src/server/repositories/{workspace.repository.ts,drizzle/…,in-memory/…}`                                                                                          |
| Service                      | `src/server/services/workspace.service.ts`                                                                                                                         |
| Who may touch a link         | `assertCanManageLink` in `src/server/services/authorization.ts`                                                                                                    |
| Active workspace per request | `actorFromSession` in `src/server/auth/session.ts`, `ApiKeyService.authenticate`                                                                                   |
| Server actions               | `src/features/workspaces/actions.ts`                                                                                                                               |
| Screens                      | `/dashboard/team`, `/invite/[token]`, the switcher in `AppShell`, `src/features/workspaces/components/*`                                                           |
| Account deletion             | `user.deleteUser.beforeDelete` in `src/server/auth/auth.ts` → `WorkspaceService.prepareAccountDeletion`                                                            |
| Tests                        | `tests/unit/{permissions,workspace.service}.test.ts`, `tests/component/team.test.tsx`, `tests/integration/workspace.repository.test.ts`, `tests/e2e/teams.spec.ts` |
