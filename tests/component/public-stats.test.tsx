import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicStatsCard } from "@/features/links/components/public-stats-card";
import { PublicStatsView } from "@/features/analytics/components/public-stats-view";
import type { PublicLinkStats } from "@/server/services/analytics.service";
import { makeLinkDto } from "../support/link-dto";

const execute = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute, isPending: false }),
}));
vi.mock("@/features/links/actions", () => ({ setPublicStatsAction: vi.fn() }));

beforeEach(() => execute.mockClear());

describe("PublicStatsCard", () => {
  it("is off by default and turns on with one click", async () => {
    const link = makeLinkDto();
    render(<PublicStatsCard link={link} />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByLabelText("Public stats address")).toBeNull();
    await userEvent.click(toggle);
    expect(execute).toHaveBeenCalledWith({ id: link.id, mode: "enable" });
  });

  it("shows the address and lets the owner replace or revoke it", async () => {
    const link = makeLinkDto({ statsUrl: "https://sho.rt/stats/abcdefghijklmnopqrstuv" });
    render(<PublicStatsCard link={link} />);
    expect(screen.getByLabelText("Public stats address")).toHaveValue(link.statsUrl);

    await userEvent.click(screen.getByRole("button", { name: /generate a new address/i }));
    expect(execute).toHaveBeenLastCalledWith({ id: link.id, mode: "rotate" });

    await userEvent.click(screen.getByRole("switch"));
    expect(execute).toHaveBeenLastCalledWith({ id: link.id, mode: "disable" });
  });
});

const stats: PublicLinkStats = {
  label: "Spring sale",
  code: "promo",
  range: { from: "2026-05-02T12:00:00.000Z", to: "2026-06-01T12:00:00.000Z" },
  totalClicks: 1234,
  uniqueVisitors: 800,
  timeseries: [{ bucket: "2026-05-31T00:00:00.000Z", clicks: 10 }],
  countries: [{ value: "FR", clicks: 700 }],
  referrers: [{ value: "news.example", clicks: 500 }],
  devices: [{ value: "desktop", clicks: 900 }],
  generatedAt: "2026-06-01T12:00:00.000Z",
};

describe("PublicStatsView", () => {
  it("shows the totals and says plainly what the unique count means", () => {
    render(<PublicStatsView stats={stats} />);
    expect(screen.getByRole("heading", { level: 1, name: "Spring sale" })).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("800")).toBeInTheDocument();
    expect(screen.getByText(/counted once per day/i)).toBeInTheDocument();
    expect(screen.getByText("news.example")).toBeInTheDocument();
  });

  it("has no per-visitor sections", () => {
    render(<PublicStatsView stats={stats} />);
    for (const heading of [/recent/i, /visitor log/i, /heatmap/i, /utm/i, /smart routing/i, /cities/i]) {
      expect(screen.queryByRole("heading", { name: heading })).toBeNull();
    }
  });
});
