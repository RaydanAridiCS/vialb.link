import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UtmBuilder } from "@/features/links/components/utm-builder";

const URL_ = "https://example.com/page?ref=1#top";
const apply = () => screen.getByRole("button", { name: "Apply to long URL" });
const preview = () => screen.getByTestId("utm-preview");

describe("UtmBuilder", () => {
  it("fills source and medium from a preset and previews the resulting URL", async () => {
    const user = userEvent.setup();
    render(<UtmBuilder destinationUrl={URL_} onApply={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Instagram bio" }));

    expect(screen.getByLabelText("Source")).toHaveValue("instagram");
    expect(screen.getByLabelText("Medium")).toHaveValue("social_bio");
    expect(preview()).toHaveTextContent("ref=1");
    expect(preview()).toHaveTextContent("utm_source=instagram");
    expect(preview()).toHaveTextContent("utm_medium=social_bio");
    expect(preview().textContent?.endsWith("#top")).toBe(true);
  });

  it("keeps fields a preset does not set", async () => {
    const user = userEvent.setup();
    render(<UtmBuilder destinationUrl="https://example.com/" onApply={vi.fn()} />);

    await user.type(screen.getByLabelText("Campaign"), "spring-sale");
    await user.click(screen.getByRole("button", { name: "TikTok" }));

    expect(screen.getByLabelText("Campaign")).toHaveValue("spring-sale");
    expect(screen.getByLabelText("Source")).toHaveValue("tiktok");
  });

  it("updates the preview live while typing", async () => {
    const user = userEvent.setup();
    render(<UtmBuilder destinationUrl="https://example.com/" onApply={vi.fn()} />);

    await user.type(screen.getByLabelText("Term"), "running shoes");

    expect(preview()).toHaveTextContent("utm_term=running+shoes");
  });

  it("writes the result back through onApply", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<UtmBuilder destinationUrl={URL_} onApply={onApply} />);

    await user.click(screen.getByRole("button", { name: "Email newsletter" }));
    await user.click(apply());

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(
      "https://example.com/page?ref=1&utm_source=newsletter&utm_medium=email#top",
    );
  });

  it("pre-fills from UTM parameters already on the URL and has nothing to apply yet", () => {
    render(
      <UtmBuilder destinationUrl="https://example.com/?utm_source=a&utm_campaign=b" onApply={vi.fn()} />,
    );

    expect(screen.getByLabelText("Source")).toHaveValue("a");
    expect(screen.getByLabelText("Campaign")).toHaveValue("b");
    expect(apply()).toBeDisabled();
  });

  it("removes a parameter when its field is cleared", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <UtmBuilder destinationUrl="https://example.com/?utm_source=a&utm_campaign=b" onApply={onApply} />,
    );

    await user.clear(screen.getByLabelText("Source"));
    await user.click(apply());

    expect(onApply).toHaveBeenCalledWith("https://example.com/?utm_campaign=b");
  });

  it("is disabled with a hint while the long URL is not valid", () => {
    render(<UtmBuilder destinationUrl="not a url" onApply={vi.fn()} />);

    expect(apply()).toBeDisabled();
    expect(preview()).toHaveTextContent(/valid long URL/i);
  });
});
