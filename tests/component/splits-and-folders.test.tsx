import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VariantsPanel } from "@/features/analytics/components/variants-panel";
import { FoldersDialog } from "@/features/links/components/folders-dialog";
import { LinksTable } from "@/features/links/components/links-table";
import { RoutingRules } from "@/features/links/components/routing-rules";
import type { RoutingRule } from "@/lib/routing";
import { makeLinkDto } from "../support/link-dto";
import { router, setLocation } from "../support/navigation-mock";

const calls: Record<string, ReturnType<typeof vi.fn>> = {};
const executeFor = (name: string) => (calls[name] ??= vi.fn());

vi.mock("@/features/links/actions", () => ({
  deleteLinksAction: "delete",
  setLinksEnabledAction: "toggle",
  saveQrOptionsAction: "qr",
  recheckLinkHealthAction: "recheck",
  dismissLinkHealthAction: "dismiss",
  moveToFolderAction: "move-folder",
  moveToWorkspaceAction: "move-workspace",
  createFolderAction: "create-folder",
  renameFolderAction: "rename-folder",
  deleteFolderAction: "delete-folder",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: (action: string) => ({ execute: executeFor(action), isPending: false, isExecuting: false }),
}));

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockClear();
  setLocation("/dashboard/links");
});

const folders = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Spring", linkCount: 2 },
  { id: "22222222-2222-4222-8222-222222222222", name: "Archive", linkCount: 0 },
];
const base = { total: 2, page: 1, pageSize: 20, tags: [] as string[] };

describe("folders in the links table", () => {
  it("shows the folder on each row and filters through the URL", async () => {
    const user = userEvent.setup();
    setLocation("/dashboard/links", "page=2");
    render(
      <LinksTable
        {...base}
        folders={folders}
        links={[
          makeLinkDto({ code: "filed", folder: { id: folders[0]?.id ?? "", name: "Spring" } }),
          makeLinkDto({ code: "loose" }),
        ]}
      />,
    );
    const rows = screen.getAllByTestId("link-row");
    expect(within(rows[0] as HTMLElement).getByTestId("link-folder")).toHaveTextContent("Spring");
    expect(within(rows[1] as HTMLElement).queryByTestId("link-folder")).toBeNull();

    await user.click(screen.getByRole("combobox", { name: "Filter by folder" }));
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual([
      "All folders",
      "No folder",
      "Spring",
      "Archive",
    ]);
    await user.click(screen.getByRole("option", { name: "No folder" }));
    const url = new URL(String(router.replace.mock.calls[0]?.[0]), "https://x.test");
    expect(url.searchParams.get("folder")).toBe("none");
    expect(url.searchParams.has("page")).toBe(false);
  });

  it("hides folder controls when there are no folders, and for viewers", () => {
    const { rerender } = render(<LinksTable {...base} links={[makeLinkDto()]} />);
    expect(screen.queryByRole("combobox", { name: "Filter by folder" })).toBeNull();
    expect(screen.getByTestId("manage-folders")).toBeInTheDocument();
    rerender(<LinksTable {...base} folders={folders} readOnly links={[makeLinkDto()]} />);
    expect(screen.queryByTestId("manage-folders")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Filter by folder" })).toBeInTheDocument();
  });

  it("moves the selected links to a folder, or out of folders", async () => {
    const user = userEvent.setup();
    const links = [makeLinkDto({ code: "one" }), makeLinkDto({ code: "two" })];
    render(<LinksTable {...base} folders={folders} links={links} />);
    await user.click(screen.getByRole("checkbox", { name: "Select /one" }));
    await user.click(screen.getByRole("checkbox", { name: "Select /two" }));

    await user.click(screen.getByRole("combobox", { name: "Move to folder" }));
    await user.click(await screen.findByRole("option", { name: "Archive" }));
    expect(executeFor("move-folder")).toHaveBeenLastCalledWith({
      ids: links.map((l) => l.id),
      folderId: folders[1]?.id,
    });

    await user.click(screen.getByRole("combobox", { name: "Move to folder" }));
    await user.click(await screen.findByRole("option", { name: "No folder" }));
    expect(executeFor("move-folder")).toHaveBeenLastCalledWith({
      ids: links.map((l) => l.id),
      folderId: null,
    });
  });

  it("offers other workspaces to move to only when there are some", async () => {
    const user = userEvent.setup();
    const link = makeLinkDto({ code: "go" });
    const { rerender } = render(<LinksTable {...base} links={[link]} />);
    await user.click(screen.getByRole("checkbox", { name: "Select /go" }));
    expect(screen.queryByRole("combobox", { name: "Move to workspace" })).toBeNull();

    rerender(
      <LinksTable
        {...base}
        links={[link]}
        moveTargets={[{ id: "33333333-3333-4333-8333-333333333333", name: "Team" }]}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Move to workspace" }));
    await user.click(await screen.findByRole("option", { name: "Team" }));
    expect(executeFor("move-workspace")).toHaveBeenCalledWith({
      ids: [link.id],
      workspaceId: "33333333-3333-4333-8333-333333333333",
    });
  });
});

describe("FoldersDialog", () => {
  it("creates, renames and deletes with a confirmation, and says links are kept", async () => {
    const user = userEvent.setup();
    render(<FoldersDialog folders={folders} />);
    await user.click(screen.getByTestId("manage-folders"));
    expect(await screen.findByText(/never deletes its links/)).toBeInTheDocument();
    expect(screen.getAllByTestId("folder-item")).toHaveLength(2);
    expect(screen.getByText("2 links")).toBeInTheDocument();
    expect(screen.getByText("0 links")).toBeInTheDocument();

    await user.type(screen.getByLabelText("New folder name"), "Summer");
    await user.click(screen.getByRole("button", { name: /add/i }));
    expect(executeFor("create-folder")).toHaveBeenCalledWith({ name: "Summer" });

    await user.click(screen.getByRole("button", { name: "Rename Spring" }));
    const input = screen.getByRole("textbox", { name: "Rename Spring" });
    await user.clear(input);
    await user.type(input, "Spring 2026");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(executeFor("rename-folder")).toHaveBeenCalledWith({ id: folders[0]?.id, name: "Spring 2026" });

    await user.click(screen.getByRole("button", { name: "Delete Archive" }));
    expect(executeFor("delete-folder")).not.toHaveBeenCalled(); // asks first
    await user.click(screen.getByRole("button", { name: "Delete folder" }));
    expect(executeFor("delete-folder")).toHaveBeenCalledWith({ id: folders[1]?.id });
  });

  it("does not submit an empty name", async () => {
    const user = userEvent.setup();
    render(<FoldersDialog folders={[]} />);
    await user.click(screen.getByTestId("manage-folders"));
    expect(await screen.findByText("No folders yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add/i })).toBeDisabled();
  });
});

describe("split editor", () => {
  function setup(initial: RoutingRule[] = []) {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<RoutingRules initial={initial} onChange={onChange} destinationUrl="https://site.example/" />);
    const last = (): RoutingRule[] => onChange.mock.lastCall?.[0] ?? [];
    return { user, last };
  }

  it("the A/B test button adds a rule with two even destinations", async () => {
    const { user, last } = setup();
    await user.click(screen.getByRole("button", { name: /a\/b test/i }));
    expect(last()).toEqual([
      {
        url: "",
        variants: [
          { url: "", weight: 50 },
          { url: "", weight: 50 },
        ],
      },
    ]);
    expect(screen.getByTestId("split-total-1")).toHaveTextContent("Shares add up to 100%");
    expect(screen.getByText("Rule 1:").parentElement).toHaveTextContent("Everyone · split 50% / 50%");
  });

  it("edits destinations and shares; the rule's own URL follows destination A", async () => {
    const { user, last } = setup([
      {
        url: "https://a.example/",
        variants: [
          { url: "https://a.example/", weight: 50 },
          { url: "https://b.example/", weight: 50 },
        ],
      },
    ]);
    const a = screen.getByLabelText("Destination A for rule 1");
    await user.clear(a);
    await user.type(a, "https://control.example/");
    expect(last()[0]?.url).toBe("https://control.example/");
    expect(last()[0]?.variants?.[0]?.url).toBe("https://control.example/");

    fireEvent.change(screen.getByLabelText("Share of A for rule 1"), { target: { value: "70" } });
    expect(last()[0]?.variants?.map((v) => v.weight)).toEqual([70, 50]);
    expect(screen.getByTestId("split-total-1")).toHaveTextContent("add up to 120%");
    expect(screen.getByTestId("split-total-1")).toHaveAttribute("role", "alert");
  });

  it("adds and removes destinations, re-dividing evenly to exactly 100%, within 2 to 5", async () => {
    const { user, last } = setup([
      {
        url: "https://a.example/",
        variants: [
          { url: "https://a.example/", weight: 50 },
          { url: "https://b.example/", weight: 50 },
        ],
      },
    ]);
    expect(screen.getByRole("button", { name: "Remove destination A from rule 1" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /add a destination/i }));
    expect(last()[0]?.variants?.map((v) => v.weight)).toEqual([34, 33, 33]);
    await user.click(screen.getByRole("button", { name: /add a destination/i }));
    await user.click(screen.getByRole("button", { name: /add a destination/i }));
    expect(last()[0]?.variants?.map((v) => v.weight)).toEqual([20, 20, 20, 20, 20]);
    expect(screen.getByRole("button", { name: /add a destination/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove destination E from rule 1" }));
    expect(last()[0]?.variants?.map((v) => v.weight)).toEqual([25, 25, 25, 25]);
  });

  it("turning the split off keeps destination A as the rule's URL", async () => {
    const { user, last } = setup([
      {
        platform: "ios",
        url: "https://a.example/",
        variants: [
          { url: "https://a.example/", weight: 60 },
          { url: "https://b.example/", weight: 40 },
        ],
      },
    ]);
    await user.click(screen.getByRole("switch", { name: "Split traffic for rule 1" }));
    expect(last()).toEqual([{ platform: "ios", url: "https://a.example/" }]);
    expect(screen.getByLabelText("Destination for rule 1")).toHaveValue("https://a.example/");
    await user.click(screen.getByRole("switch", { name: "Split traffic for rule 1" }));
    expect(last()[0]?.variants).toEqual([
      { url: "https://a.example/", weight: 50 },
      { url: "", weight: 50 },
    ]);
  });
});

describe("VariantsPanel", () => {
  const rule: RoutingRule = {
    url: "https://a.example/",
    variants: [
      { url: "https://a.example/page", weight: 70, label: "Control" },
      { url: "https://b.example/page", weight: 30 },
    ],
  };

  it("shows planned and actual shares per destination, summing across device conditions", () => {
    render(
      <VariantsPanel
        rule={rule}
        routes={[
          { value: "variant:A", clicks: 60 },
          { value: "ios+variant:A", clicks: 10 },
          { value: "variant:B", clicks: 30 },
          { value: "default", clicks: 5 },
        ]}
      />,
    );
    const rows = within(screen.getByTestId("variants-table")).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Control");
    expect(rows[0]).toHaveTextContent("70%");
    expect(rows[0]).toHaveTextContent("70"); // clicks
    expect(rows[1]).toHaveTextContent("b.example");
    expect(rows[1]).toHaveTextContent("30%");
  });

  it("adds conversions and rate per destination when they are tracked", () => {
    render(
      <VariantsPanel
        rule={rule}
        routes={[
          { value: "variant:A", clicks: 50 },
          { value: "variant:B", clicks: 50 },
        ]}
        conversions={[
          { value: "variant:A", clicks: 50, conversions: 5, rate: 10 },
          { value: "variant:B", clicks: 50, conversions: 10, rate: 20 },
        ]}
      />,
    );
    const rows = within(screen.getByTestId("variants-table")).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("10%");
    expect(rows[1]).toHaveTextContent("20%");
    expect(screen.getByText(/Small samples are noisy/)).toBeInTheDocument();
  });

  it("copes with no clicks yet", () => {
    render(<VariantsPanel rule={rule} routes={[]} />);
    expect(screen.getAllByText("n/a")).toHaveLength(2);
  });
});
