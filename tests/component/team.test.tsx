import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeRoleAction,
  deleteWorkspaceAction,
  inviteMemberAction,
  leaveWorkspaceAction,
  removeMemberAction,
  renameWorkspaceAction,
  revokeInviteAction,
  switchWorkspaceAction,
} from "@/features/workspaces/actions";
import {
  TeamManager,
  type TeamInviteView,
  type TeamManagerProps,
  type TeamMemberView,
} from "@/features/workspaces/components/team-manager";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/features/workspaces/components/workspace-switcher";
import type { WorkspaceRole } from "@/lib/permissions";
import { router } from "../support/navigation-mock";

vi.mock("@/features/workspaces/actions", () => ({
  changeRoleAction: vi.fn(),
  deleteWorkspaceAction: vi.fn(),
  inviteMemberAction: vi.fn(),
  leaveWorkspaceAction: vi.fn(),
  removeMemberAction: vi.fn(),
  renameWorkspaceAction: vi.fn(),
  revokeInviteAction: vi.fn(),
  switchWorkspaceAction: vi.fn(),
}));
// Runs the "action" and then the success or error callback, like the real hook does after the server replies.
vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    fn: (input: unknown) => Promise<{ data?: unknown; serverError?: string }>,
    options?: {
      onSuccess?: (arg: { data: unknown; input: unknown }) => void;
      onError?: (arg: { error: { serverError?: string } }) => void;
    },
  ) => ({
    execute: (input: unknown) => {
      void Promise.resolve(fn(input)).then((result) => {
        if (result?.serverError) options?.onError?.({ error: { serverError: result.serverError } });
        else options?.onSuccess?.({ data: result?.data, input });
      });
    },
    isPending: false,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const changeRole = mocked(changeRoleAction);
const deleteTeam = mocked(deleteWorkspaceAction);
const invite = mocked(inviteMemberAction);
const leave = mocked(leaveWorkspaceAction);
const removeMember = mocked(removeMemberAction);
const rename = mocked(renameWorkspaceAction);
const revoke = mocked(revokeInviteAction);
const switchTo = mocked(switchWorkspaceAction);

const member = (userId: string, role: WorkspaceRole): TeamMemberView => ({
  userId,
  name: userId[0]?.toUpperCase() + userId.slice(1),
  email: `${userId}@x.io`,
  role,
  joinedAt: "2026-06-01T12:00:00.000Z",
});

function props(role: WorkspaceRole, over: Partial<TeamManagerProps> = {}): TeamManagerProps {
  return {
    workspace: { id: "00000000-0000-4000-8000-000000000001", name: "Acme", role },
    members: [
      member("alice", "owner"),
      member("bob", "admin"),
      member("carol", "editor"),
      member("dave", "viewer"),
    ],
    invites: [],
    currentUserId: "alice",
    ...over,
  };
}

const pending: TeamInviteView = {
  id: "00000000-0000-4000-8000-0000000000aa",
  email: "erin@x.io",
  role: "editor",
  expiresAt: "2026-06-08T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const action of [changeRole, deleteTeam, invite, leave, removeMember, rename, revoke, switchTo]) {
    action.mockResolvedValue({ data: { ok: true } });
  }
});

const row = (email: string) => screen.getByTestId(`member-${email}`);

describe("TeamManager as an owner", () => {
  it("shows the role and every member, with a role picker and remove button for others but not for yourself", () => {
    render(<TeamManager {...props("owner")} />);
    expect(screen.getByText(/You are a/)).toHaveTextContent("Owner");
    expect(within(row("alice@x.io")).getByText("(you)")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Role for bob@x.io" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove bob@x.io" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove alice@x.io" })).not.toBeInTheDocument();
  });

  it("changes a member's role", async () => {
    const user = userEvent.setup();
    render(<TeamManager {...props("owner")} />);
    await user.click(screen.getByRole("combobox", { name: "Role for dave@x.io" }));
    await user.click(await screen.findByRole("option", { name: "Editor" }));
    await waitFor(() =>
      expect(changeRole).toHaveBeenCalledWith({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        userId: "dave",
        role: "editor",
      }),
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("removes a member", async () => {
    const user = userEvent.setup();
    render(<TeamManager {...props("owner")} />);
    await user.click(screen.getByRole("button", { name: "Remove carol@x.io" }));
    await waitFor(() =>
      expect(removeMember).toHaveBeenCalledWith({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        userId: "carol",
      }),
    );
  });

  it("renames the team only when the name changed", async () => {
    const user = userEvent.setup();
    render(<TeamManager {...props("owner")} />);
    const button = screen.getByRole("button", { name: "Rename" });
    expect(button).toBeDisabled();
    await user.clear(screen.getByLabelText("Team name"));
    await user.type(screen.getByLabelText("Team name"), "Acme Inc");
    await user.click(button);
    await waitFor(() =>
      expect(rename).toHaveBeenCalledWith({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        name: "Acme Inc",
      }),
    );
  });

  it("invites someone and shows the link to share when email was not sent", async () => {
    invite.mockResolvedValue({
      data: { url: "https://sho.rt/invite/abc", emailSent: false, email: "erin@x.io" },
    });
    const user = userEvent.setup();
    render(<TeamManager {...props("owner")} />);
    await user.type(screen.getByLabelText("Email address"), "erin@x.io");
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));
    await waitFor(() =>
      expect(invite).toHaveBeenCalledWith({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        email: "erin@x.io",
        role: "editor",
      }),
    );
    const result = await screen.findByTestId("invite-result");
    expect(result).toHaveTextContent("Email isn't set up on this instance");
    expect(within(result).getByLabelText("Invitation link")).toHaveValue("https://sho.rt/invite/abc");
  });

  it("says when the invitation was emailed", async () => {
    invite.mockResolvedValue({
      data: { url: "https://sho.rt/invite/abc", emailSent: true, email: "erin@x.io" },
    });
    const user = userEvent.setup();
    render(<TeamManager {...props("owner")} />);
    await user.type(screen.getByLabelText("Email address"), "erin@x.io");
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));
    expect(await screen.findByTestId("invite-result")).toHaveTextContent("We emailed erin@x.io");
  });

  it("shows the reason an invitation was refused", async () => {
    invite.mockResolvedValue({ serverError: "That person is already a member" });
    const user = userEvent.setup();
    render(<TeamManager {...props("owner")} />);
    await user.type(screen.getByLabelText("Email address"), "bob@x.io");
    await user.click(screen.getByRole("button", { name: /Send invitation/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That person is already a member");
    expect(screen.queryByTestId("invite-result")).not.toBeInTheDocument();
  });

  it("lists waiting invitations and cancels one", async () => {
    const user = userEvent.setup();
    render(<TeamManager {...props("owner", { invites: [pending] })} />);
    expect(screen.getByTestId("invite-erin@x.io")).toHaveTextContent("Editor");
    await user.click(screen.getByRole("button", { name: "Cancel invitation for erin@x.io" }));
    await waitFor(() =>
      expect(revoke).toHaveBeenCalledWith({
        workspaceId: "00000000-0000-4000-8000-000000000001",
        inviteId: pending.id,
      }),
    );
  });

  it("asks before deleting and then deletes", async () => {
    const user = userEvent.setup();
    render(<TeamManager {...props("owner")} />);
    await user.click(screen.getByRole("button", { name: "Delete team" }));
    expect(await screen.findByText(/for all 4 members/)).toBeInTheDocument();
    expect(deleteTeam).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete forever" }));
    await waitFor(() =>
      expect(deleteTeam).toHaveBeenCalledWith({ workspaceId: "00000000-0000-4000-8000-000000000001" }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
  });

  it("leaves after confirming, and shows the server's reason when that is not allowed", async () => {
    leave.mockResolvedValue({ serverError: "You are the only owner." });
    const user = userEvent.setup();
    render(<TeamManager {...props("owner")} />);
    await user.click(screen.getByRole("button", { name: "Leave team" }));
    await user.click(await screen.findByRole("button", { name: "Leave" }));
    await waitFor(() => expect(leave).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
  });

  it("offers the owner role to other owners", async () => {
    const user = userEvent.setup();
    render(<TeamManager {...props("owner")} />);
    await user.click(screen.getByRole("combobox", { name: "Role for dave@x.io" }));
    expect(await screen.findByRole("option", { name: "Owner" })).toBeInTheDocument();
  });
});

describe("TeamManager as an admin", () => {
  it("cannot touch owners or other admins, and cannot hand out owner or admin", async () => {
    const user = userEvent.setup();
    render(<TeamManager {...props("admin", { currentUserId: "bob" })} />);
    expect(screen.queryByRole("combobox", { name: "Role for alice@x.io" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove alice@x.io" })).not.toBeInTheDocument();
    expect(within(row("alice@x.io")).getByText("Owner")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Role for carol@x.io" })).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Role for carol@x.io" }));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Editor", "Viewer"]);
  });

  it("can invite and rename, but not delete", () => {
    render(<TeamManager {...props("admin", { currentUserId: "bob" })} />);
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete team" })).not.toBeInTheDocument();
  });
});

describe("TeamManager as an editor or viewer", () => {
  for (const role of ["editor", "viewer"] as const) {
    it(`gives a ${role} a read-only list, with no invite form, rename or delete`, () => {
      render(<TeamManager {...props(role, { currentUserId: role === "editor" ? "carol" : "dave" })} />);
      expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Delete team" })).not.toBeInTheDocument();
      expect(screen.queryAllByRole("combobox")).toHaveLength(0);
      expect(screen.queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Leave team" })).toBeInTheDocument();
    });
  }
});

describe("WorkspaceSwitcher", () => {
  const options: WorkspaceOption[] = [
    { id: "00000000-0000-4000-8000-000000000010", name: "Personal", isPersonal: true, role: "owner" },
    { id: "00000000-0000-4000-8000-000000000011", name: "Acme", isPersonal: false, role: "editor" },
  ];

  it("names the workspace being shown", () => {
    render(<WorkspaceSwitcher current={options[1] as WorkspaceOption} options={options} />);
    expect(screen.getByTestId("workspace-switcher")).toHaveAccessibleName("Workspace: Acme");
  });

  it("lists workspaces with roles, marks the current one, and switches to another", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={options[0] as WorkspaceOption} options={options} />);
    expect(screen.getByTestId("workspace-switcher")).toHaveAccessibleName("Workspace: Personal");
    await user.click(screen.getByTestId("workspace-switcher"));
    const acme = await screen.findByTestId("workspace-option-Acme");
    expect(acme).toHaveTextContent("Editor");
    expect(
      within(await screen.findByTestId("workspace-option-personal")).getByLabelText("Current"),
    ).toBeInTheDocument();
    await user.click(acme);
    await waitFor(() =>
      expect(switchTo).toHaveBeenCalledWith({ workspaceId: "00000000-0000-4000-8000-000000000011" }),
    );
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/dashboard"));
  });

  it("does nothing when the current workspace is picked again", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={options[0] as WorkspaceOption} options={options} />);
    await user.click(screen.getByTestId("workspace-switcher"));
    await user.click(await screen.findByTestId("workspace-option-personal"));
    expect(switchTo).not.toHaveBeenCalled();
  });

  it("links to the team page", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher current={options[0] as WorkspaceOption} options={options} />);
    await user.click(screen.getByTestId("workspace-switcher"));
    expect(await screen.findByRole("menuitem", { name: /Teams and members/ })).toHaveAttribute(
      "href",
      "/dashboard/team",
    );
  });
});
