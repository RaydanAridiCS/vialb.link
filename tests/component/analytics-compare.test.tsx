import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BarList } from "@/features/analytics/components/bar-list";
import { RangePicker } from "@/features/analytics/components/range-picker";
import { router, setLocation } from "../support/navigation-mock";

describe("BarList with a previous period", () => {
  const items = [
    { value: "a.example", clicks: 10 },
    { value: "b.example", clicks: 3 },
    { value: "c.example", clicks: 5 },
    { value: "d.example", clicks: 2 },
  ];
  const previous = [
    { value: "a.example", clicks: 4 },
    { value: "b.example", clicks: 8 },
    { value: "c.example", clicks: 5 },
  ];

  it("shows +n, −n, = and new next to each row", () => {
    render(<BarList items={items} previous={previous} />);
    const change = (host: string) =>
      within(screen.getByText(host).closest("li") as HTMLElement).getByTestId("row-change");
    expect(change("a.example")).toHaveTextContent("+6");
    expect(change("b.example")).toHaveTextContent("−5");
    expect(change("c.example")).toHaveTextContent("=");
    expect(change("d.example")).toHaveTextContent("new");
    expect(change("a.example")).toHaveAttribute("title", "+150% vs previous period");
    expect(change("d.example")).toHaveAttribute("title", "Nothing in the previous period");
  });

  it("shows nothing extra without a previous period", () => {
    render(<BarList items={items} />);
    expect(screen.queryAllByTestId("row-change")).toHaveLength(0);
  });
});

describe("RangePicker compare switch", () => {
  it("is on by default and writes compare=0 when turned off", async () => {
    const user = userEvent.setup();
    setLocation("/dashboard/links/1", "range=7d");
    render(<RangePicker range="7d" includeBots={false} showCompare compare />);
    const toggle = screen.getByRole("switch", { name: "Compare to previous period" });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    const url = new URL(String(router.replace.mock.calls[0]?.[0]), "https://x.test");
    expect(url.searchParams.get("compare")).toBe("0");
  });

  it("removes the param when turned back on, and is hidden for the all-time range and the demo", async () => {
    const user = userEvent.setup();
    setLocation("/dashboard/links/1", "range=7d&compare=0");
    const { rerender } = render(<RangePicker range="7d" includeBots={false} showCompare compare={false} />);
    await user.click(screen.getByRole("switch", { name: "Compare to previous period" }));
    const url = new URL(String(router.replace.mock.calls[0]?.[0]), "https://x.test");
    expect(url.searchParams.has("compare")).toBe(false);

    rerender(<RangePicker range="all" includeBots={false} showCompare compare />);
    expect(screen.queryByRole("switch", { name: "Compare to previous period" })).toBeNull();
    rerender(<RangePicker range="7d" includeBots={false} />);
    expect(screen.queryByRole("switch", { name: "Compare to previous period" })).toBeNull();
  });
});
