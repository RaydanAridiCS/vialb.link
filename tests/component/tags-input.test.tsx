import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TagsInput } from "@/features/links/components/tags-input";
import { LIMITS } from "@/lib/constants";

/** Mirrors how the link form owns the value, so state updates between interactions are real. */
function Harness({
  initial = [],
  suggestions,
  onChange,
}: {
  initial?: string[];
  suggestions?: string[];
  onChange?: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState(initial);
  return (
    <TagsInput
      id="tags"
      value={tags}
      suggestions={suggestions}
      onChange={(next) => {
        setTags(next);
        onChange?.(next);
      }}
    />
  );
}

const chips = () =>
  screen.queryAllByRole("button", { name: /^Remove tag/ }).map((b) => b.getAttribute("aria-label"));

describe("TagsInput", () => {
  it("commits the typed text on Enter, normalized, and clears the field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox");

    await user.type(input, " #Client Work{Enter}");

    expect(onChange).toHaveBeenLastCalledWith(["client-work"]);
    expect(input).toHaveValue("");
  });

  it("commits on comma and keeps typing the next tag", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByRole("combobox"), "promo,menus");

    expect(onChange).toHaveBeenLastCalledWith(["promo"]);
    expect(screen.getByRole("combobox")).toHaveValue("menus");
  });

  it("keeps every tag of a pasted comma list (one onChange, no lost updates)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.paste("a,b,c,d");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(["a", "b", "c"]);
    expect(screen.getByRole("combobox")).toHaveValue("d");
  });

  it("commits the pending text on blur", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByRole("combobox"), "later");
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith(["later"]);
  });

  it("removes the last chip on Backspace in an empty field, and a chip through its button", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["one", "two", "three"]} />);

    await user.click(screen.getByRole("combobox"));
    await user.keyboard("{Backspace}");
    expect(chips()).toEqual(["Remove tag one", "Remove tag two"]);

    await user.click(screen.getByRole("button", { name: "Remove tag one" }));
    expect(chips()).toEqual(["Remove tag two"]);
  });

  it("does not remove a chip on Backspace while the field has text", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["one"]} />);

    await user.type(screen.getByRole("combobox"), "ab{Backspace}");

    expect(chips()).toEqual(["Remove tag one"]);
    expect(screen.getByRole("combobox")).toHaveValue("a");
  });

  it("ignores duplicates silently and clears the field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={["promo"]} onChange={onChange} />);

    await user.type(screen.getByRole("combobox"), "PROMO{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an accessible error and keeps the text for an invalid tag", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = screen.getByRole("combobox");

    await user.type(input, "bad;tag{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("bad;tag");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/letters, numbers/i);
    expect(input).toHaveAccessibleDescription(alert.textContent ?? "");
  });

  it("flags an invalid tag on blur too, and clears the error once the text is edited", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("combobox");

    await user.type(input, "bad;tag");
    await user.tab();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.click(input);
    await user.keyboard("{Backspace}");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("surfaces an invalid part of a pasted list instead of dropping it, and still adds the valid ones", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.paste("good,bad;one,fine,last");

    expect(onChange).toHaveBeenLastCalledWith(["good", "fine"]);
    // the refused tag stays in the box, together with the text that came after it
    expect(screen.getByRole("combobox")).toHaveValue("bad;one,last");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("lets the user fix a refused paste: editing it commits the good parts and keeps the rest", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.paste("bad;one,last");
    expect(screen.getByRole("combobox")).toHaveValue("bad;one,last");

    await user.clear(screen.getByRole("combobox"));
    await user.paste("fixed,last");

    expect(onChange).toHaveBeenLastCalledWith(["fixed"]);
    expect(screen.getByRole("combobox")).toHaveValue("last");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("commits a draft that still contains commas when Enter is pressed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole("combobox"));
    await user.paste("bad;one,last");

    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenLastCalledWith(["last"]);
    expect(screen.getByRole("combobox")).toHaveValue("bad;one");
  });

  it("explains an over-long tag", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByRole("combobox"), `${"a".repeat(LIMITS.tagMaxLength + 1)}{Enter}`);

    expect(screen.getByRole("alert")).toHaveTextContent(`at most ${LIMITS.tagMaxLength} characters`);
  });

  it("disables the field at the tag limit", () => {
    const full = Array.from({ length: LIMITS.tagsPerLinkMax }, (_, i) => `tag${i}`);
    render(<Harness initial={full} />);

    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("rejects the tag that would exceed the limit when pasting", async () => {
    const user = userEvent.setup();
    const nearlyFull = Array.from({ length: LIMITS.tagsPerLinkMax - 1 }, (_, i) => `tag${i}`);
    const onChange = vi.fn();
    render(<Harness initial={nearlyFull} onChange={onChange} />);

    await user.click(screen.getByRole("combobox"));
    await user.paste("one,two,three");

    expect(onChange).toHaveBeenLastCalledWith([...nearlyFull, "one"]);
    expect(screen.getByRole("alert")).toHaveTextContent(`up to ${LIMITS.tagsPerLinkMax} tags`);
  });

  it("offers only unused tags as suggestions", () => {
    const { container } = render(<Harness initial={["used"]} suggestions={["used", "fresh"]} />);

    const options = [...container.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"));
    expect(options).toEqual(["fresh"]);
  });
});
