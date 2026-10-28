import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LinksTable } from "@/features/links/components/links-table";
import { makeLinkDto } from "../support/link-dto";
import { router, setLocation } from "../support/navigation-mock";

// Server actions pull in server-only modules; the table only needs something to call.
vi.mock("@/features/links/actions", () => ({
  deleteLinksAction: vi.fn(),
  setLinksEnabledAction: vi.fn(),
  saveQrOptionsAction: vi.fn(),
  recheckLinkHealthAction: vi.fn(),
  dismissLinkHealthAction: vi.fn(),
}));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isExecuting: false }),
}));

const base = { total: 3, page: 1, pageSize: 20 } as const;

function renderTable(props: Partial<React.ComponentProps<typeof LinksTable>> = {}) {
  const links = props.links ?? [
    makeLinkDto({ code: "alpha", tags: ["promo", "client-work"] }),
    makeLinkDto({ code: "beta", tags: ["promo"] }),
    makeLinkDto({ code: "gamma" }),
  ];
  return render(<LinksTable {...base} tags={["client-work", "promo"]} {...props} links={links} />);
}

describe("LinksTable tags", () => {
  it("shows tag pills only on rows that have tags", () => {
    renderTable();
    const rows = screen.getAllByTestId("link-row");

    expect(within(rows[0] as HTMLElement).getByRole("list", { name: "Tags" })).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getAllByRole("button", { name: /^Filter by tag/ })).toHaveLength(2);
    expect(within(rows[2] as HTMLElement).queryByRole("list", { name: "Tags" })).not.toBeInTheDocument();
  });

  it("filters by a tag when its pill is clicked and drops the page param", async () => {
    const user = userEvent.setup();
    setLocation("/dashboard/links", "page=3&q=shop");
    renderTable();

    await user.click(screen.getAllByRole("button", { name: "Filter by tag promo" })[0] as HTMLElement);

    expect(router.replace).toHaveBeenCalledTimes(1);
    const url = new URL(String(router.replace.mock.calls[0]?.[0]), "https://x.test");
    expect(url.pathname).toBe("/dashboard/links");
    expect(url.searchParams.get("tag")).toBe("promo");
    expect(url.searchParams.get("q")).toBe("shop");
    expect(url.searchParams.has("page")).toBe(false);
  });

  it("marks the active tag pill as pressed and clears the filter when it is clicked again", async () => {
    const user = userEvent.setup();
    setLocation("/dashboard/links", "tag=promo");
    renderTable();

    const pills = screen.getAllByRole("button", { name: "Filter by tag promo" });
    for (const pill of pills) expect(pill).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Filter by tag client-work" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(pills[0] as HTMLElement);

    const url = new URL(String(router.replace.mock.calls[0]?.[0]), "https://x.test");
    expect(url.searchParams.has("tag")).toBe(false);
  });

  it("filters from the tag dropdown and can go back to all tags", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("combobox", { name: "Filter by tag" }));
    await user.click(await screen.findByRole("option", { name: "client-work" }));

    const url = new URL(String(router.replace.mock.calls[0]?.[0]), "https://x.test");
    expect(url.searchParams.get("tag")).toBe("client-work");
  });

  it("lists every tag in the dropdown plus 'All tags'", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole("combobox", { name: "Filter by tag" }));

    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toEqual(["All tags", "client-work", "promo"]);
  });

  it("hides the tag dropdown when there are no tags and no tag filter", () => {
    renderTable({ tags: [], links: [makeLinkDto({ code: "solo" })], total: 1 });

    expect(screen.queryByRole("combobox", { name: "Filter by tag" })).not.toBeInTheDocument();
  });

  it("keeps the dropdown (and the active tag selectable) when the filter matches nothing", async () => {
    const user = userEvent.setup();
    setLocation("/dashboard/links", "tag=ghost");
    renderTable({ tags: [], links: [], total: 0 });

    const trigger = screen.getByRole("combobox", { name: "Filter by tag" });
    expect(trigger).toHaveTextContent("ghost");
    expect(screen.getByText("Nothing found")).toBeInTheDocument();

    await user.click(trigger);
    expect((await screen.findAllByRole("option")).map((o) => o.textContent)).toEqual(["All tags", "ghost"]);
  });
});

describe("LinksTable basics", () => {
  it("shows the empty state with a create link when nothing is filtered", () => {
    renderTable({ links: [], total: 0, tags: [] });

    expect(screen.getByText("No links yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create your first link/i })).toHaveAttribute(
      "href",
      "/dashboard/links/new",
    );
  });

  it("reports the visible range", () => {
    renderTable({ total: 45, page: 2, pageSize: 20 });

    expect(screen.getByText("21–40 of 45")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("exports the selected links as CSV with an apostrophe guarding formula-looking cells", async () => {
    const user = userEvent.setup();
    let exported = "";
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob.text().then((t) => (exported = t));
      return "blob:mock";
    });
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderTable({
      links: [makeLinkDto({ code: "evil", title: "=HYPERLINK(1)", tags: ["promo", "client-work"] })],
      total: 1,
    });

    await user.click(screen.getByRole("checkbox", { name: "Select /evil" }));
    await user.click(screen.getByRole("button", { name: /export csv/i }));

    await vi.waitFor(() => expect(exported).not.toBe(""));
    const [header, row] = exported.split("\r\n");
    expect(header).toBe(
      "code,short_url,destination_url,title,tags,status,clicks,max_clicks,expires_at,has_password,created_at",
    );
    expect(row).toContain("'=HYPERLINK(1)");
    expect(row).toContain("promo client-work");
  });
});
