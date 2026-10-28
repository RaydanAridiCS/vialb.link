import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinkHealthCard } from "@/features/links/components/link-health-card";
import { LinksTable } from "@/features/links/components/links-table";
import type { LinkHealthDto } from "@/server/services/dto";
import { makeLinkDto } from "../support/link-dto";
import { router, setLocation } from "../support/navigation-mock";

const recheck = vi.fn();
const dismiss = vi.fn();
const noop = vi.fn();

vi.mock("@/features/links/actions", () => ({
  deleteLinksAction: "delete",
  setLinksEnabledAction: "toggle",
  saveQrOptionsAction: "qr",
  recheckLinkHealthAction: "recheck",
  dismissLinkHealthAction: "dismiss",
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: (action: string) => ({
    execute: action === "recheck" ? recheck : action === "dismiss" ? dismiss : noop,
    isPending: false,
    isExecuting: false,
  }),
}));

beforeEach(() => {
  recheck.mockClear();
  dismiss.mockClear();
  setLocation("/dashboard/links");
});

const flagged: LinkHealthDto = {
  state: "flagged",
  needsAttention: true,
  dismissed: false,
  lastCheckedAt: "2026-06-01T10:00:00.000Z",
  reason: "not_found",
  statusCode: 404,
  failingTarget: "https://a.example/gone",
};

const props = { total: 2, page: 1, pageSize: 20, tags: [] as string[] };

describe("LinksTable: destination health", () => {
  it("shows a 'Needs attention' badge with the reason on flagged rows only", () => {
    render(
      <LinksTable
        {...props}
        healthEnabled
        links={[makeLinkDto({ code: "broken", health: flagged }), makeLinkDto({ code: "fine" })]}
      />,
    );
    const rows = screen.getAllByTestId("link-row");
    const broken = within(rows[0] as HTMLElement);
    expect(broken.getByTestId("needs-attention")).toHaveTextContent("Needs attention");
    expect(broken.getByTestId("needs-attention")).toHaveAttribute(
      "title",
      expect.stringContaining("The page was not found"),
    );
    expect(broken.getByText(/The page was not found/)).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).queryByTestId("needs-attention")).toBeNull();
  });

  it("says nothing about health when the monitor is off, even if old records exist", () => {
    render(<LinksTable {...props} links={[makeLinkDto({ code: "broken", health: flagged })]} />);
    expect(screen.queryByTestId("needs-attention")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Filter by destination health" })).toBeNull();
  });

  it("hides the badge for a dismissed flag", () => {
    const dismissed = { ...flagged, needsAttention: false, dismissed: true };
    render(<LinksTable {...props} healthEnabled links={[makeLinkDto({ code: "x", health: dismissed })]} />);
    expect(screen.queryByTestId("needs-attention")).toBeNull();
  });

  it("filters by health through the URL and drops the page", async () => {
    const user = userEvent.setup();
    setLocation("/dashboard/links", "page=2");
    render(<LinksTable {...props} healthEnabled links={[makeLinkDto({ code: "a" })]} />);

    await user.click(screen.getByRole("combobox", { name: "Filter by destination health" }));
    await user.click(await screen.findByRole("option", { name: "Needs attention" }));

    const url = new URL(String(router.replace.mock.calls[0]?.[0]), "https://x.test");
    expect(url.searchParams.get("health")).toBe("attention");
    expect(url.searchParams.has("page")).toBe(false);
  });

  it("keeps the filter visible while it is active even if the monitor was switched off", () => {
    setLocation("/dashboard/links", "health=attention");
    render(<LinksTable {...props} links={[]} total={0} />);
    expect(screen.getByRole("combobox", { name: "Filter by destination health" })).toHaveTextContent(
      "Needs attention",
    );
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
  });

  it("offers re-check on active links and dismiss on flagged ones", async () => {
    const user = userEvent.setup();
    const link = makeLinkDto({ code: "broken", health: flagged });
    render(<LinksTable {...props} healthEnabled links={[link]} />);

    await user.click(screen.getByRole("button", { name: "Actions for /broken" }));
    await user.click(await screen.findByRole("menuitem", { name: /re-check destination/i }));
    expect(recheck).toHaveBeenCalledWith({ id: link.id });

    await user.click(screen.getByRole("button", { name: "Actions for /broken" }));
    await user.click(await screen.findByRole("menuitem", { name: /dismiss warning/i }));
    expect(dismiss).toHaveBeenCalledWith({ id: link.id });
  });

  it("does not offer re-check for links that are never checked, or to viewers", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <LinksTable {...props} healthEnabled links={[makeLinkDto({ code: "locked", hasPassword: true })]} />,
    );
    await user.click(screen.getByRole("button", { name: "Actions for /locked" }));
    expect(screen.queryByRole("menuitem", { name: /re-check destination/i })).toBeNull();
    await user.keyboard("{Escape}");

    rerender(<LinksTable {...props} healthEnabled readOnly links={[makeLinkDto({ code: "view" })]} />);
    await user.click(screen.getByRole("button", { name: "Actions for /view" }));
    expect(screen.queryByRole("menuitem", { name: /re-check destination/i })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /dismiss warning/i })).toBeNull();
  });
});

describe("LinkHealthCard", () => {
  it("explains a flagged link, naming the routing target that failed", () => {
    const link = makeLinkDto({
      destinationUrl: "https://a.example/",
      health: { ...flagged, reason: "dns", statusCode: null, failingTarget: "https://apps.example/ios" },
    });
    render(<LinkHealthCard link={link} />);
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText(/The domain could not be found/)).toBeInTheDocument();
    expect(screen.getByText("https://apps.example/ios")).toBeInTheDocument();
  });

  it("re-checks on demand", async () => {
    const user = userEvent.setup();
    const link = makeLinkDto({ health: { ...flagged, needsAttention: false, state: "ok", reason: null } });
    render(<LinkHealthCard link={link} />);
    expect(screen.getByText("Reachable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /re-check now/i }));
    expect(recheck).toHaveBeenCalledWith({ id: link.id });
    expect(screen.queryByRole("button", { name: /dismiss warning/i })).toBeNull();
  });

  it("shows 'Not checked yet' before the first check and disables re-check for links that are never checked", () => {
    const { rerender } = render(<LinkHealthCard link={makeLinkDto()} />);
    expect(screen.getByText("Not checked yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-check now/i })).toBeEnabled();

    rerender(<LinkHealthCard link={makeLinkDto({ isEnabled: false, status: "disabled" })} />);
    expect(screen.getByText("Not checked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-check now/i })).toBeDisabled();
    expect(screen.getByText(/are not checked/)).toBeInTheDocument();
  });

  it("lets the owner dismiss a flag", async () => {
    const user = userEvent.setup();
    const link = makeLinkDto({ health: flagged });
    render(<LinkHealthCard link={link} />);
    await user.click(screen.getByRole("button", { name: /dismiss warning/i }));
    expect(dismiss).toHaveBeenCalledWith({ id: link.id });
  });
});
