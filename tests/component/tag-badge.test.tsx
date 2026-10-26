import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TagBadge } from "@/features/links/components/tag-badge";

function dotHue(tag: string): number {
  const { container } = render(<TagBadge tag={tag} />);
  const dot = container.querySelector<HTMLElement>("span[aria-hidden]");
  const match = /oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/.exec(
    dot?.getAttribute("style") ?? dot?.style.backgroundColor ?? "",
  );
  if (!match?.[1]) throw new Error(`no hue found for ${tag}: ${dot?.outerHTML}`);
  return Number(match[1]);
}

describe("TagBadge", () => {
  it("renders the tag text", () => {
    const { getByText } = render(<TagBadge tag="client-work" />);
    expect(getByText("client-work")).toBeInTheDocument();
  });

  it("gives the same tag the same hue every time", () => {
    expect(dotHue("promo")).toBe(dotHue("promo"));
  });

  it("only uses cool or neutral hues, never orange/red/yellow (0-120deg)", () => {
    const tags = ["promo", "menus", "client-work", "a", "b", "zzz", "launch2026", "été", "日本語", "x_y-z"];
    for (const tag of tags) {
      const hue = dotHue(tag);
      expect(hue, `hue for ${tag}`).toBeGreaterThanOrEqual(145);
      expect(hue, `hue for ${tag}`).toBeLessThanOrEqual(345);
    }
  });

  it("spreads different tags over several hues", () => {
    const hues = new Set(Array.from({ length: 30 }, (_, i) => dotHue(`tag-${i}`)));
    expect(hues.size).toBeGreaterThan(3);
  });
});
