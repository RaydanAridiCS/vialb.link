import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoutingRules, type RoutingRulesProps } from "@/features/links/components/routing-rules";
import type { RoutingRule } from "@/lib/routing";

const APP_STORE = "https://apps.apple.com/app/id1";
const PLAY = "https://play.google.com/store/apps/details?id=app";
const SITE = "https://app.example/";

function setup(initial: RoutingRule[] = [], props: Partial<RoutingRulesProps> = {}) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<RoutingRules initial={initial} onChange={onChange} destinationUrl={SITE} {...props} />);
  const lastRules = (): RoutingRule[] => onChange.mock.lastCall?.[0] ?? [];
  return { user, onChange, lastRules };
}

describe("RoutingRules", () => {
  it("starts collapsed and empty for a link without rules", () => {
    setup();
    expect(screen.getByText("Smart routing").closest("details")).not.toHaveAttribute("open");
    expect(screen.queryByRole("list", { name: "Routing rules" })).not.toBeInTheDocument();
    expect(screen.queryByText("Try it")).not.toBeInTheDocument();
  });

  it("opens by itself and counts the rules when a link already has some", () => {
    setup([{ platform: "ios", url: APP_STORE }]);
    expect(screen.getByText("Smart routing").closest("details")).toHaveAttribute("open");
    expect(screen.getByText("1 rule")).toBeInTheDocument();
  });

  it("adds an iPhone and an Android rule with one click, once", async () => {
    const { user, lastRules } = setup();
    const preset = screen.getByRole("button", { name: "App Store + Google Play" });
    await user.click(preset);
    expect(lastRules()).toEqual([
      { platform: "ios", url: "" },
      { platform: "android", url: "" },
    ]);
    expect(preset).toBeDisabled();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("only adds the half of the preset that is missing", async () => {
    const { user, lastRules } = setup([{ platform: "ios", url: APP_STORE }]);
    await user.click(screen.getByRole("button", { name: "App Store + Google Play" }));
    expect(lastRules().map((rule) => rule.platform)).toEqual(["ios", "android"]);
  });

  it("reports edits to the destination", async () => {
    const { user, lastRules } = setup([{ platform: "ios", url: "" }]);
    await user.type(screen.getByLabelText("Destination for rule 1"), "https://a.example");
    expect(lastRules()).toEqual([{ platform: "ios", url: "https://a.example" }]);
  });

  it("turns typed countries into upper-case codes but keeps the text as typed", async () => {
    const { user, lastRules } = setup([{ platform: "android", url: PLAY }]);
    const field = screen.getByLabelText("Countries for rule 1");
    await user.type(field, "us, ca;g");
    expect(field).toHaveValue("us, ca;g");
    expect(lastRules()[0]?.countries).toEqual(["US", "CA", "G"]);
    await user.type(field, "b ");
    expect(lastRules()[0]?.countries).toEqual(["US", "CA", "GB"]);
    await user.clear(field);
    expect(lastRules()[0]?.countries).toEqual([]);
  });

  it("changes the device of a rule", async () => {
    const { user, lastRules } = setup([{ countries: ["FR"], url: SITE }]);
    await user.click(screen.getByRole("combobox", { name: "Device for rule 1" }));
    await user.click(await screen.findByRole("option", { name: "Android" }));
    expect(lastRules()[0]).toMatchObject({ platform: "android", countries: ["FR"] });

    await user.click(screen.getByRole("combobox", { name: "Device for rule 1" }));
    await user.click(await screen.findByRole("option", { name: "Any device" }));
    expect(lastRules()[0]?.platform).toBeUndefined();
  });

  it("reorders and removes rules, keeping the others intact", async () => {
    const { user, lastRules } = setup([
      { platform: "ios", url: "https://one.example" },
      { platform: "android", url: "https://two.example" },
      { platform: "desktop", url: "https://three.example" },
    ]);
    expect(screen.getByRole("button", { name: "Move rule 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move rule 3 down" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Move rule 3 up" }));
    expect(lastRules().map((rule) => rule.platform)).toEqual(["ios", "desktop", "android"]);

    await user.click(screen.getByRole("button", { name: "Remove rule 1" }));
    expect(lastRules().map((rule) => rule.platform)).toEqual(["desktop", "android"]);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("stops at the maximum number of rules", async () => {
    const full = Array.from({ length: 10 }, (_, i) => ({
      countries: [`A${String.fromCharCode(65 + i)}`],
      url: SITE,
    }));
    const { user, onChange } = setup(full);
    await user.click(screen.getByRole("button", { name: "Add a rule" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("shows validation messages next to the rule and for the set", () => {
    setup([{ platform: "ios", url: "" }], {
      errors: ["Enter a URL"],
      error: "Rule 2 has the same conditions as an earlier rule",
    });
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "Enter a URL",
      "Rule 2 has the same conditions as an earlier rule",
    ]);
  });

  it("explains that country rules need geolocation, only when some rule uses countries", async () => {
    const { user } = setup([{ platform: "ios", url: APP_STORE }]);
    expect(screen.queryByText(/TRUST_PROXY_GEO_HEADERS/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Countries for rule 1"), "US");
    expect(screen.getByText(/TRUST_PROXY_GEO_HEADERS/)).toBeInTheDocument();
  });

  describe("the visitor tester", () => {
    const rules: RoutingRule[] = [
      { platform: "ios", countries: ["FR"], url: "https://fr-ios.example" },
      { platform: "android", url: PLAY },
      { countries: ["DE"], url: "https://de.example" },
    ];
    const result = () => within(screen.getByTestId("routing-test-result"));

    it("shows the rule a desktop visitor from nowhere would hit: none, so the long URL", () => {
      setup(rules);
      expect(screen.getByTestId("routing-test-result")).toHaveTextContent(
        `Goes to ${SITE} (no rule matches)`,
      );
    });

    it("follows the device and country the tester is set to", async () => {
      const { user } = setup(rules);
      await user.click(screen.getByRole("combobox", { name: "Visitor's device" }));
      await user.click(await screen.findByRole("option", { name: "Android" }));
      expect(result().getByText(PLAY)).toBeInTheDocument();
      expect(screen.getByTestId("routing-test-result")).toHaveTextContent("(rule 2)");

      await user.click(screen.getByRole("combobox", { name: "Visitor's device" }));
      await user.click(await screen.findByRole("option", { name: "iPhone & iPad" }));
      await user.type(screen.getByLabelText("Visitor's country"), "fr");
      expect(result().getByText("https://fr-ios.example")).toBeInTheDocument();
    });

    it("matches a country rule on any device, and treats 'something else' as no platform", async () => {
      const { user } = setup(rules);
      await user.click(screen.getByRole("combobox", { name: "Visitor's device" }));
      await user.click(await screen.findByRole("option", { name: "Something else (bot, TV…)" }));
      await user.type(screen.getByLabelText("Visitor's country"), "de");
      expect(result().getByText("https://de.example")).toBeInTheDocument();
    });

    it("follows edits to the rules", async () => {
      const { user } = setup([{ platform: "desktop", url: "https://old.example" }]);
      expect(result().getByText("https://old.example")).toBeInTheDocument();
      await user.clear(screen.getByLabelText("Destination for rule 1"));
      await user.type(screen.getByLabelText("Destination for rule 1"), "https://new.example");
      expect(result().getByText("https://new.example")).toBeInTheDocument();
    });
  });
});
