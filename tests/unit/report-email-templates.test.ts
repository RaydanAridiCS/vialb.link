import { describe, expect, it } from "vitest";
import {
  describeChange,
  renderBrokenLinksEmail,
  renderWeeklyReportEmail,
} from "@/server/auth/report-email-templates";
import type { WorkspaceReport } from "@/server/domain/types";

const base = {
  appName: "Vialb",
  siteUrl: "https://sho.rt",
  dashboardUrl: "https://sho.rt/dashboard",
  settingsUrl: "https://sho.rt/dashboard/settings",
};

const report: WorkspaceReport = {
  clicks: 150,
  previousClicks: 100,
  uniqueVisitors: 90,
  topLinks: [
    { linkId: "1", code: "promo", title: "Spring <sale>", clicks: 100, previousClicks: 40 },
    { linkId: "2", code: "docs", title: null, clicks: 50, previousClicks: 60 },
  ],
  topReferrers: [{ value: "news.example", clicks: 80 }],
  topCountries: [
    { value: "FR", clicks: 70 },
    { value: "Unknown", clicks: 5 },
  ],
};

describe("describeChange", () => {
  it.each([
    [150, 100, "+50%"],
    [50, 100, "-50%"],
    [100, 100, "no change"],
    [100, 99, "+1%"],
    [5, 0, "new"],
    [0, 0, "no change"],
    [0, 10, "-100%"],
    [1004, 1000, "no change"],
  ])("%i vs %i is %s", (current, previous, expected) => {
    expect(describeChange(current, previous)).toBe(expected);
  });
});

describe("renderWeeklyReportEmail", () => {
  const mail = renderWeeklyReportEmail({
    ...base,
    workspaceName: 'Acme "Team" <b>',
    periodLabel: "May 25 – Jun 1, 2026",
    report,
    countryName: (code) => (code === "FR" ? "France" : code),
  });

  it("has a readable plain-text version with every figure", () => {
    expect(mail.text).toContain("Clicks: 150 (+50% vs the week before: 100)");
    expect(mail.text).toContain("Unique visitors: 90 (counted once per day)");
    expect(mail.text).toContain("1. Spring <sale>: 100 (+150%)");
    expect(mail.text).toContain("2. /docs: 50 (-17%)");
    expect(mail.text).toContain("news.example: 80");
    expect(mail.text).toContain("France: 70");
    expect(mail.text).toContain("Unknown: 5");
    expect(mail.text).toContain("https://sho.rt/dashboard/settings");
    expect(mail.text).not.toMatch(/<table|<td|&lt;/);
  });

  it("escapes everything that came from users in the HTML", () => {
    expect(mail.html).not.toContain("<sale>");
    expect(mail.html).toContain("Spring &lt;sale&gt;");
    expect(mail.html).not.toContain("<b>");
    expect(mail.html).toContain("Acme &quot;Team&quot; &lt;b&gt;");
  });

  it("links to the dashboard and the opt-out, and uses the brand green, never orange", () => {
    expect(mail.html).toContain('href="https://sho.rt/dashboard"');
    expect(mail.html).toContain('href="https://sho.rt/dashboard/settings"');
    expect(mail.html).toContain("#166534");
    expect(mail.html.toLowerCase()).not.toMatch(/#(e5531a|d04a12|f0703a|ff8c00|f97316|ea580c)/);
  });

  it("handles a quiet week without broken markup", () => {
    const quiet = renderWeeklyReportEmail({
      ...base,
      workspaceName: "Quiet",
      periodLabel: "x",
      report: {
        clicks: 0,
        previousClicks: 3,
        uniqueVisitors: 0,
        topLinks: [],
        topReferrers: [],
        topCountries: [],
      },
    });
    expect(quiet.text).toContain("Clicks: 0 (-100% vs the week before: 3)");
    expect(quiet.text).toContain("  none");
    expect(quiet.html).toContain("Nothing this week.");
  });
});

describe("renderBrokenLinksEmail", () => {
  const links = [
    {
      code: "dead",
      title: "Old <promo>",
      destinationUrl: "https://a.example/gone",
      reason: "The page was not found (404 or 410)",
      failingTarget: "https://a.example/gone",
    },
    {
      code: "routed",
      title: null,
      destinationUrl: "https://a.example/",
      reason: "The domain could not be found",
      failingTarget: "https://apps.example/ios",
    },
  ];

  it("lists each link with its reason and the target that actually failed", () => {
    const mail = renderBrokenLinksEmail({
      ...base,
      workspaceName: "Acme",
      reviewUrl: "https://sho.rt/dashboard/links?health=attention",
      links,
      more: 3,
    });
    expect(mail.text).toContain("5 links need attention");
    expect(mail.text).toContain("/dead (Old <promo>)");
    expect(mail.text).toContain("https://apps.example/ios");
    expect(mail.text).toContain("...and 3 more.");
    expect(mail.html).toContain("Old &lt;promo&gt;");
    expect(mail.html).not.toContain("<promo>");
    expect(mail.html).toContain("health=attention");
  });

  it("uses singular wording for one link", () => {
    const mail = renderBrokenLinksEmail({
      ...base,
      workspaceName: "Acme",
      reviewUrl: "https://sho.rt/x",
      links: links.slice(0, 1),
      more: 0,
    });
    expect(mail.text.split("\n")[0]).toBe('1 link needs attention in "Acme"');
    expect(mail.text).not.toContain("more.");
  });
});
