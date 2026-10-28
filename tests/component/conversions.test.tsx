import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversionsPanel } from "@/features/analytics/components/conversions-panel";
import { ConversionsCard } from "@/features/links/components/conversions-card";
import type { ConversionAnalytics } from "@/server/services/analytics.service";
import { makeLinkDto } from "../support/link-dto";

const execute = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-safe-action/hooks", () => ({ useAction: () => ({ execute, isPending: false }) }));
vi.mock("@/features/links/actions", () => ({ setConversionsAction: vi.fn() }));

beforeEach(() => execute.mockClear());

describe("ConversionsCard", () => {
  it("states what the setting does before it is turned on, and turns on with one click", async () => {
    const link = makeLinkDto();
    render(<ConversionsCard link={link} siteUrl="https://sho.rt" />);
    expect(screen.getByText(/random/)).toHaveTextContent("vclid");
    expect(screen.getByText(/destination and anything that logs its URLs will see it/)).toBeInTheDocument();
    expect(screen.getByText(/No cookies are set by Vialb/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Copy script tag")).toBeNull();

    await userEvent.click(screen.getByRole("switch"));
    expect(execute).toHaveBeenCalledWith({ id: link.id, enabled: true });
  });

  it("shows the snippet and the postback URL once on, and warns about what the id can do", async () => {
    const link = makeLinkDto({ conversionsEnabled: true });
    render(<ConversionsCard link={link} siteUrl="https://sho.rt" />);
    expect(screen.getByLabelText("Copy script tag")).toHaveValue(
      '<script src="https://sho.rt/api/convert/snippet.js"></script>',
    );
    expect(screen.getByLabelText("Copy postback URL")).toHaveValue(
      "https://sho.rt/api/convert?cid={vclid}&value={amount}&currency=USD",
    );
    expect(screen.getByText(/do not use these numbers to reconcile payments/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch"));
    expect(execute).toHaveBeenCalledWith({ id: link.id, enabled: false });
  });
});

const data: ConversionAnalytics = {
  conversions: 12,
  eligibleClicks: 80,
  rate: 15,
  values: [
    { currency: "USD", totalMinor: 123450, count: 10 },
    { currency: "EUR", totalMinor: 5000, count: 2 },
  ],
  previous: { conversions: 6, eligibleClicks: 60, rate: 10 },
  byRoute: [
    { value: "default", clicks: 40, conversions: 4, rate: 10 },
    { value: "ios", clicks: 40, conversions: 8, rate: 20 },
    { value: "Unknown", clicks: 5, conversions: 0, rate: 0 },
  ],
  byCountry: [{ value: "FR", clicks: 80, conversions: 12, rate: 15 }],
  byDevice: [{ value: "desktop", clicks: 80, conversions: 12, rate: 15 }],
};

describe("ConversionsPanel", () => {
  it("shows the totals, rate change, and value per currency without adding currencies together", () => {
    render(<ConversionsPanel data={data} />);
    const panel = within(screen.getByTestId("conversions-panel"));
    expect(panel.getAllByText("12").length).toBeGreaterThan(0);
    expect(panel.getAllByText("15%").length).toBeGreaterThan(0);
    expect(panel.getByText("+5 points vs previous period")).toBeInTheDocument();
    expect(panel.getByText("$1,234.50 · €50.00")).toBeInTheDocument();
    expect(panel.getByText("Currencies are never added together")).toBeInTheDocument();
  });

  it("breaks the rate down by variant, country and device, and says recent clicks may not have converted yet", () => {
    render(<ConversionsPanel data={data} />);
    expect(screen.getByText(/Very recent clicks may not have had time to convert/)).toBeInTheDocument();
    const rows = screen.getAllByRole("row").map((r) => r.textContent);
    expect(rows.some((r) => r?.includes("iPhone & iPad") && r.includes("20%"))).toBe(true);
    expect(rows.some((r) => r?.includes("France") && r.includes("15%"))).toBe(true);
    expect(rows.some((r) => r?.includes("desktop"))).toBe(true);
    // "Unknown" routes (clicks before rules existed) are not listed as a variant.
    expect(rows.some((r) => r?.startsWith("Unknown") && r.includes("0%"))).toBe(false);
  });

  it("copes with nothing yet", () => {
    render(
      <ConversionsPanel
        data={{
          ...data,
          conversions: 0,
          eligibleClicks: 0,
          rate: null,
          values: [],
          previous: null,
          byRoute: [],
          byCountry: [],
          byDevice: [],
        }}
      />,
    );
    expect(screen.getByText("n/a")).toBeInTheDocument();
    expect(screen.getByText("None reported")).toBeInTheDocument();
    expect(screen.getAllByText("Nothing yet.").length).toBeGreaterThan(0);
  });
});
