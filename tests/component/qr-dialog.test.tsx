import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { saveQrOptionsAction } from "@/features/links/actions";
import { QrDialog } from "@/features/links/components/qr-dialog";
import { QrPreview } from "@/features/links/components/qr-preview";
import { QR_FRAME_TEXT_MAX } from "@/lib/qr-options";
import { makeLinkDto } from "../support/link-dto";

vi.mock("@/features/links/actions", () => ({ saveQrOptionsAction: vi.fn() }));
// Runs the "action" and then the success callback, like the real hook does after the server replies.
vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    fn: (input: unknown) => Promise<unknown>,
    options?: { onSuccess?: (arg: { data: unknown }) => void },
  ) => ({
    execute: (input: unknown) => {
      void Promise.resolve(fn(input)).then((data) => options?.onSuccess?.({ data }));
    },
    isPending: false,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const save = vi.mocked(saveQrOptionsAction) as unknown as ReturnType<typeof vi.fn>;

function previewSvg(): string {
  const src = (screen.getByTestId("qr-preview") as HTMLImageElement).getAttribute("src") ?? "";
  return decodeURIComponent(src.replace("data:image/svg+xml;charset=utf-8,", ""));
}
const viewBox = (svg: string) => /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)?.slice(1).map(Number) ?? [];

function open(over: Partial<ReturnType<typeof makeLinkDto>> = {}, onOpenChange = vi.fn()) {
  const link = makeLinkDto({ code: "menu", ...over });
  render(<QrDialog link={link} open onOpenChange={onOpenChange} />);
  return { link, onOpenChange, user: userEvent.setup() };
}

/** The download buttons keep their shape: an anchor with href while usable, a disabled button otherwise. */
const download = (name: RegExp | string) => screen.getByRole("link", { name });

describe("QrPreview", () => {
  it("draws the same SVG the server would, as an image", () => {
    render(
      <QrPreview
        value="https://sho.rt/abc"
        ecc="Q"
        fg="#112233"
        bg="#EEFFEE"
        frame="badge"
        frameText="Menu"
      />,
    );
    const svg = previewSvg();
    expect(svg).toContain('fill="#112233"');
    expect(svg).toContain('fill="#EEFFEE"');
    expect(svg).toContain(">Menu</text>");
  });

  it("shows no frame by default and falls back to default colours while a hex is half typed", () => {
    render(<QrPreview value="https://sho.rt/abc" fg="#12" bg="nope" />);
    const svg = previewSvg();
    expect(svg).not.toContain("<text");
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('fill="#FFFFFF"');
  });

  it("makes the image taller when a frame is added", () => {
    const { rerender } = render(<QrPreview value="https://sho.rt/abc" />);
    const [, plainHeight = 0] = viewBox(previewSvg());
    rerender(<QrPreview value="https://sho.rt/abc" frame="badge" />);
    const [, framedHeight = 0] = viewBox(previewSvg());
    expect(framedHeight).toBeGreaterThan(plainHeight);
  });

  it("describes the image for screen readers", () => {
    render(<QrPreview value="https://sho.rt/abc" />);
    expect(screen.getByRole("img", { name: "QR code for https://sho.rt/abc" })).toBeInTheDocument();
  });
});

describe("QrDialog", () => {
  it("starts with the link's saved design", () => {
    open({ qrFgColor: "#112233", qrBgColor: "#EEEEEE", qrEcc: "Q", qrFrame: "badge", qrFrameText: "Menu" });

    expect(screen.getByLabelText("Foreground")).toHaveValue("#112233");
    expect(screen.getByLabelText("Background")).toHaveValue("#EEEEEE");
    expect(screen.getByLabelText("Error correction")).toHaveValue("Q");
    expect(screen.getByRole("radio", { name: "Badge under the code" })).toBeChecked();
    expect(screen.getByLabelText("Badge text")).toHaveValue("Menu");
    expect(previewSvg()).toContain(">Menu</text>");
  });

  it("is labelled and names the link", () => {
    open();
    expect(screen.getByRole("dialog", { name: "QR code for /menu" })).toBeInTheDocument();
  });

  it("updates the preview as the options change", async () => {
    const { user } = open({ qrEcc: "L", qrFrame: "none" });
    const [, plainHeight = 0] = viewBox(previewSvg());
    expect(previewSvg()).not.toContain("<text");

    await user.click(screen.getByRole("radio", { name: "Badge under the code" }));
    expect(previewSvg()).toContain(">Scan me</text>");
    expect(viewBox(previewSvg())[1]).toBeGreaterThan(plainHeight);

    await user.type(screen.getByLabelText("Badge text"), "Visit us");
    expect(previewSvg()).toContain(">Visit us</text>");

    const sideAtL = viewBox(previewSvg())[0] ?? 0;
    await user.selectOptions(screen.getByLabelText("Error correction"), "H");
    expect(viewBox(previewSvg())[0]).toBeGreaterThan(sideAtL);

    await fireColour(screen.getByLabelText("Foreground"), "#0F4C3A");
    expect(previewSvg()).toContain('fill="#0F4C3A"');

    await user.click(screen.getByRole("radio", { name: "No frame" }));
    expect(previewSvg()).not.toContain("<text");
    expect(screen.queryByLabelText("Badge text")).not.toBeInTheDocument();
  });

  it("limits the badge text length", async () => {
    const { user } = open({ qrFrame: "badge" });
    const input = screen.getByLabelText("Badge text");
    await user.type(input, "x".repeat(QR_FRAME_TEXT_MAX + 10));
    expect((input as HTMLInputElement).value).toHaveLength(QR_FRAME_TEXT_MAX);
  });

  it("keeps the preview readable while a colour is half typed", async () => {
    const { user } = open();
    const fg = screen.getByLabelText("Foreground");
    await user.clear(fg);
    await user.type(fg, "#12");

    expect(fg).toHaveAttribute("aria-invalid", "true");
    // the preview keeps showing the last valid colours instead of breaking
    expect(previewSvg()).toContain('fill="#000000"');
    expect(screen.getByRole("button", { name: /^SVG$/ })).toBeDisabled();
  });

  it("links the downloads to the server with exactly what the preview shows", async () => {
    const { link, user } = open({ qrFgColor: "#112233", qrBgColor: "#FFFFFF", qrEcc: "H" });
    await user.click(screen.getByRole("radio", { name: "Badge under the code" }));
    await user.type(screen.getByLabelText("Badge text"), "Menu & more");

    const urlOf = (name: RegExp | string) =>
      new URL(download(name).getAttribute("href") ?? "", "https://x.test");

    const svg = urlOf(/^SVG$/);
    expect(svg.pathname).toBe(`/api/app/links/${link.id}/qr`);
    expect(Object.fromEntries(svg.searchParams)).toEqual({
      format: "svg",
      fg: "#112233",
      bg: "#FFFFFF",
      ecc: "H",
      frame: "badge",
      frameText: "Menu & more",
      size: "1024",
      download: "1",
    });
    expect(urlOf(/^PNG$/).searchParams.get("format")).toBe("png");
    expect(urlOf(/^PNG$/).searchParams.get("size")).toBe("1024");
    expect(urlOf(/High-res PNG/).searchParams.get("size")).toBe("2048");
    for (const name of [/^SVG$/, /^PNG$/, /High-res PNG/]) expect(download(name)).toHaveAttribute("download");
  });

  it("does not send badge text when there is no frame", async () => {
    const { user } = open({ qrFrame: "badge", qrFrameText: "Menu" });
    await user.click(screen.getByRole("radio", { name: "No frame" }));

    const url = new URL(download(/^SVG$/).getAttribute("href") ?? "", "https://x.test");
    expect(url.searchParams.get("frame")).toBe("none");
    expect(url.searchParams.has("frameText")).toBe(false);
  });

  it("warns about weak or inverted colours but still allows downloading", async () => {
    open({ qrFgColor: "#FFFFFF", qrBgColor: "#000000" });

    expect(screen.getByRole("status")).toHaveTextContent(/inverted|dark background/i);
    expect(download(/^SVG$/)).toBeInTheDocument();
  });

  it("blocks downloads and saving when the colours cannot be scanned", async () => {
    open();
    await fireColour(screen.getByLabelText("Foreground"), "#EEEEEE");

    expect(await screen.findByRole("alert")).toHaveTextContent(/too similar/i);
    expect(screen.queryByRole("link", { name: /SVG|PNG/ })).not.toBeInTheDocument();
    for (const name of [/^SVG$/, /^PNG$/, /High-res PNG/, /Save as default/]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    // and recovers once the colours are fine again
    await fireColour(screen.getByLabelText("Foreground"), "#000000");
    expect(await screen.findByRole("link", { name: /^SVG$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save as default/ })).toBeEnabled();
  });

  it("disables downloads while a colour is not a valid hex", async () => {
    const { user } = open();
    const bg = screen.getByLabelText("Background");
    await user.clear(bg);
    await user.type(bg, "#ABC");

    expect(screen.getByRole("button", { name: /High-res PNG/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save as default/ })).toBeDisabled();
  });

  it("saves the whole design and closes", async () => {
    save.mockResolvedValue({ link: {} });
    const { link, user, onOpenChange } = open();
    await user.click(screen.getByRole("radio", { name: "Badge under the code" }));
    await user.type(screen.getByLabelText("Badge text"), "Menu");
    await user.selectOptions(screen.getByLabelText("Error correction"), "Q");
    await fireColour(screen.getByLabelText("Foreground"), "#112233");

    await user.click(screen.getByRole("button", { name: /Save as default/ }));

    expect(save).toHaveBeenCalledWith({
      id: link.id,
      qrFgColor: "#112233",
      qrBgColor: "#FFFFFF",
      qrEcc: "Q",
      qrFrame: "badge",
      qrFrameText: "Menu",
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("saves an empty badge text when the frame is off, so stale text is cleared", async () => {
    save.mockResolvedValue({ link: {} });
    const { link, user } = open({ qrFrame: "badge", qrFrameText: "Old" });
    await user.click(screen.getByRole("radio", { name: "No frame" }));

    await user.click(screen.getByRole("button", { name: /Save as default/ }));

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: link.id, qrFrame: "none", qrFrameText: "" }),
    );
  });

  it("offers every error correction level with a plain explanation", () => {
    open();
    const options = within(screen.getByLabelText("Error correction")).getAllByRole("option");
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(["L", "M", "Q", "H"]);
    expect(screen.getByText(/denser/i)).toBeInTheDocument();
  });
});

/** `<input type="color">` and text inputs share one handler; this sets the hex text input like a user would paste it. */
function fireColour(input: HTMLElement, value: string) {
  const user = userEvent.setup();
  return user.clear(input).then(() => user.click(input).then(() => user.paste(value)));
}
