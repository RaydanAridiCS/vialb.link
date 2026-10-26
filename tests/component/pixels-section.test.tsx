import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Form } from "@/components/ui/form";
import type { LinkFormValues } from "@/features/links/components/link-form";
import { PixelsSection } from "@/features/links/components/pixels-section";
import { pixelsSchema } from "@/features/links/schemas";
import { z } from "zod";

const schema = z.object({ pixels: pixelsSchema });

function Harness({
  enabled = true,
  pixels = { meta: "", google: "" },
}: {
  enabled?: boolean;
  pixels?: { meta: string; google: string };
}) {
  const form = useForm<LinkFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<LinkFormValues>,
    defaultValues: { pixels } as unknown as LinkFormValues,
  });
  const watched = useWatch({ control: form.control, name: "pixels" });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(() => undefined)}>
        <PixelsSection form={form} enabled={enabled} />
        <button type="submit">Save</button>
        <output data-testid="values">{JSON.stringify(watched)}</output>
      </form>
    </Form>
  );
}

const details = () => screen.getByText("Retargeting pixels").closest("details");

describe("PixelsSection", () => {
  it("starts closed for a link without pixels and open for one that has them", () => {
    const { unmount } = render(<Harness />);
    expect(details()).not.toHaveAttribute("open");
    unmount();
    render(<Harness pixels={{ meta: "123456789", google: "" }} />);
    expect(details()).toHaveAttribute("open");
    expect(screen.getByLabelText("Meta Pixel ID")).toHaveValue("123456789");
  });

  it("keeps what is typed in the form values", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Meta Pixel ID"), "123456789012345");
    await user.type(screen.getByLabelText("Google tag ID"), "G-ABCD1234");
    expect(JSON.parse(screen.getByTestId("values").textContent ?? "{}")).toEqual({
      meta: "123456789012345",
      google: "G-ABCD1234",
    });
  });

  it("explains what is wrong with an ID next to its field", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Meta Pixel ID"), "abc");
    await user.type(screen.getByLabelText("Google tag ID"), "UA-1");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("A Meta Pixel ID is 8 to 20 digits")).toBeVisible();
    expect(screen.getByText(/A Google tag ID looks like G-XXXXXXX/)).toBeVisible();
  });

  it("accepts a lower-case Google tag and leaves empty fields alone", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Google tag ID"), "gtm-abc123");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByText(/looks like G-XXXXXXX/)).not.toBeInTheDocument();
    expect(screen.queryByText(/8 to 20 digits/)).not.toBeInTheDocument();
  });

  it("says pixels are switched off for the instance, but still lets them be edited", async () => {
    render(<Harness enabled={false} />);
    expect(screen.getByTestId("pixels-disabled")).toHaveTextContent(/switched off on this instance/);
    expect(screen.getByLabelText("Meta Pixel ID")).toBeEnabled();
  });

  it("says nothing about being off while the instance allows pixels", () => {
    render(<Harness enabled />);
    expect(screen.queryByTestId("pixels-disabled")).not.toBeInTheDocument();
  });
});
