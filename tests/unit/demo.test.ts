import { describe, expect, it } from "vitest";
import { deriveInsights } from "@/features/analytics/insights";
import { buildDemoAnalytics, DEMO_RANGES, generateDemoClicks } from "@/features/demo/generate";
import { SCENARIO_IDS } from "@/features/demo/scenarios";

const NOW = new Date("2026-06-17T15:30:00Z");

describe("demo analytics generator", () => {
  it("is deterministic for the same scenario and day", () => {
    const a = buildDemoAnalytics("launch", "30d", { now: NOW });
    const b = buildDemoAnalytics("launch", "30d", { now: NOW });
    expect(a).toEqual(b);
  });

  it("never produces clicks after now", () => {
    const clicks = generateDemoClicks("podcast", NOW);
    expect(clicks.length).toBeGreaterThan(0);
    expect(clicks.every((c) => c.at < NOW.getTime())).toBe(true);
  });

  it.each(SCENARIO_IDS)("builds a consistent report for %s", (scenario) => {
    for (const range of DEMO_RANGES) {
      const report = buildDemoAnalytics(scenario, range, { now: NOW });
      const seriesTotal = report.timeseries.reduce((sum, p) => sum + p.clicks, 0);
      const heatmapTotal = report.heatmap.reduce((sum, c) => sum + c.clicks, 0);
      expect(seriesTotal).toBe(report.summary.totalClicks);
      expect(heatmapTotal).toBe(report.summary.totalClicks);
      expect(report.summary.uniqueVisitors).toBeLessThanOrEqual(report.summary.totalClicks);
      expect(report.range.bucket).toBe(range === "24h" ? "hour" : "day");
      expect(report.recent.length).toBeLessThanOrEqual(25);
      for (const values of Object.values(report.dimensions)) expect(values.length).toBeLessThanOrEqual(10);
    }
  });

  it("excludes bots unless asked", () => {
    const without = buildDemoAnalytics("launch", "90d", { now: NOW });
    const withBots = buildDemoAnalytics("launch", "90d", { now: NOW, includeBots: true });
    expect(without.summary.botClicks).toBeGreaterThan(0);
    expect(withBots.summary.totalClicks).toBe(without.summary.totalClicks + without.summary.botClicks);
    expect(without.dimensions.device_type.some((d) => d.value === "bot")).toBe(false);
  });
});

describe("deriveInsights", () => {
  it("returns nothing for tiny reports", () => {
    const report = buildDemoAnalytics("launch", "24h", { now: NOW });
    expect(deriveInsights({ ...report, summary: { ...report.summary, totalClicks: 3 } })).toEqual([]);
  });

  it("calls out direct traffic and the closed day for the QR menu", () => {
    const ids = deriveInsights(buildDemoAnalytics("menu", "30d", { now: NOW })).map((i) => i.id);
    expect(ids).toContain("source");
    expect(ids).toContain("quiet");
    const source = deriveInsights(buildDemoAnalytics("menu", "30d", { now: NOW })).find(
      (i) => i.id === "source",
    );
    expect(source?.label).toBe("Direct traffic");
  });

  it("names the top referrer for the launch", () => {
    const source = deriveInsights(buildDemoAnalytics("launch", "30d", { now: NOW })).find(
      (i) => i.id === "source",
    );
    expect(source?.value).toBe("news.ycombinator.com");
  });
});
