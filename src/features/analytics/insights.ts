import { countryName } from "@/lib/format";
import type { LinkAnalytics } from "@/server/services/analytics.service";

export interface Insight {
  id: "peak" | "source" | "device" | "country" | "quiet";
  label: string;
  value: string;
  detail: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOUR_LABEL = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const dayName = (weekday: number) => WEEKDAYS[weekday] ?? "Unknown";

function share(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/**
 * Plain-language takeaways from an analytics report. Each insight only appears
 * when there is enough data to make it meaningful.
 */
export function deriveInsights(data: LinkAnalytics, minClicks = 20): Insight[] {
  const total = data.summary.totalClicks;
  if (total < minClicks) return [];
  const insights: Insight[] = [];

  const peak = data.heatmap.reduce<(typeof data.heatmap)[number] | null>(
    (best, cell) => (!best || cell.clicks > best.clicks ? cell : best),
    null,
  );
  if (peak) {
    insights.push({
      id: "peak",
      label: "Busiest time",
      value: `${dayName(peak.weekday).slice(0, 3)} ${HOUR_LABEL(peak.hour)}`,
      detail: `Clicks peak on ${dayName(peak.weekday)}s around ${HOUR_LABEL(peak.hour)} UTC. Post or send around then.`,
    });
  }

  const referrers = data.dimensions.referrer_host;
  const topReferrer = referrers.find((r) => r.value !== "Unknown");
  const direct = referrers.find((r) => r.value === "Unknown");
  const directShare = share(direct?.clicks ?? 0, total);
  if (directShare >= 60) {
    insights.push({
      id: "source",
      label: "Direct traffic",
      value: `${directShare}%`,
      detail: "Most visits had no referrer. That is typical for QR codes, chat apps and email.",
    });
  } else if (topReferrer) {
    insights.push({
      id: "source",
      label: "Top source",
      value: topReferrer.value.replace(/^www\./, ""),
      detail: `Sent ${share(topReferrer.clicks, total)}% of all clicks in this period.`,
    });
  }

  const devices = data.dimensions.device_type;
  const humanTotal = devices.filter((d) => d.value !== "bot").reduce((sum, d) => sum + d.clicks, 0);
  const mobile = devices.find((d) => d.value === "mobile")?.clicks ?? 0;
  const desktop = devices.find((d) => d.value === "desktop")?.clicks ?? 0;
  if (humanTotal > 0) {
    const mobileShare = share(mobile, humanTotal);
    const desktopShare = share(desktop, humanTotal);
    insights.push(
      mobileShare >= desktopShare
        ? {
            id: "device",
            label: "On a phone",
            value: `${mobileShare}%`,
            detail: `${mobileShare >= 50 ? "Most people open" : "Phones are the most common way to open"} this link. Make sure the destination works well on mobile.`,
          }
        : {
            id: "device",
            label: "On a computer",
            value: `${desktopShare}%`,
            detail: `${desktopShare >= 50 ? "Most people open" : "Computers are the most common way to open"} this link, likely while working or reading.`,
          },
    );
  }

  const weekdayTotals = Array.from({ length: 7 }, (_, weekday) =>
    data.heatmap.filter((c) => c.weekday === weekday).reduce((sum, c) => sum + c.clicks, 0),
  );
  const average = weekdayTotals.reduce((a, b) => a + b, 0) / 7;
  const quietest = weekdayTotals.indexOf(Math.min(...weekdayTotals));
  if (data.range.bucket === "day" && average > 0 && (weekdayTotals[quietest] ?? 0) < average * 0.15) {
    insights.push({
      id: "quiet",
      label: "Quiet day",
      value: dayName(quietest),
      detail: `Almost no clicks on ${dayName(quietest)}s. A closed day or a gap in your posting schedule.`,
    });
  }

  const topCountry = data.dimensions.country.find((c) => c.value !== "Unknown");
  if (topCountry && insights.length < 4) {
    insights.push({
      id: "country",
      label: "Top country",
      value: countryName(topCountry.value),
      detail: `${share(topCountry.clicks, total)}% of clicks came from ${countryName(topCountry.value)}.`,
    });
  }

  return insights.slice(0, 4);
}
