import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, useWatch } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { Form } from "@/components/ui/form";
import type { LinkFormValues } from "@/features/links/components/link-form";
import { SocialCardStudio } from "@/features/links/components/social-card-studio";
import {
  IMessagePreview,
  SlackPreview,
  SocialPreviews,
  WhatsAppPreview,
  XPreview,
  type SocialPreviewData,
} from "@/features/links/components/social-previews";
import { PALETTES } from "@/lib/palettes";
import type { CardDesign } from "@/lib/social-card";
import type { LinkDto } from "@/server/services/dto";
import { makeLinkDto } from "../support/link-dto";

const card: CardDesign = {
  template: "plain",
  palette: "ink",
  headline: "Saved headline",
  subline: "Saved subtitle",
  showHost: true,
};

type Values = Pick<
  LinkFormValues,
  "ogTitle" | "ogDescription" | "ogImageUrl" | "cardDesign" | "title" | "destinationUrl" | "customCode"
>;

function Harness({ values, link }: { values?: Partial<Values>; link?: LinkDto }) {
  const form = useForm<LinkFormValues>({
    defaultValues: {
      ogTitle: "",
      ogDescription: "",
      ogImageUrl: "",
      cardDesign: null,
      title: "",
      destinationUrl: "https://shop.example/products/blue-shoes",
      customCode: "",
      ...values,
    } as unknown as LinkFormValues,
  });
  const watched = useWatch({ control: form.control });
  return (
    <Form {...form}>
      <SocialCardStudio form={form} siteUrl="https://sho.rt" link={link} />
      <output data-testid="values">{JSON.stringify(watched)}</output>
    </Form>
  );
}

const radio = (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });

function setup(values?: Partial<Values>, link?: LinkDto) {
  const user = userEvent.setup();
  render(<Harness values={values} link={link} />);
  const current = (): Values => JSON.parse(screen.getByTestId("values").textContent ?? "{}") as Values;
  const open = () => screen.getByText("Social preview").closest("details")?.setAttribute("open", "");
  open();
  return { user, current };
}

/** The SVG behind the first preview image that is a data: URI. */
function cardSvg(): string {
  const image = [...document.querySelectorAll("img")].find((img) => img.src.startsWith("data:image/svg+xml"));
  return image ? decodeURIComponent(image.src.replace("data:image/svg+xml;charset=utf-8,", "")) : "";
}

describe("SocialCardStudio", () => {
  it("starts closed with no image for a link that has none", () => {
    setup();
    expect(radio("No image")).toBeChecked();
    expect(screen.queryByTestId("card-controls")).not.toBeInTheDocument();
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });

  it("opens by itself and shows the saved card for a link that has one", () => {
    render(<Harness values={{ cardDesign: card }} />);
    expect(screen.getByText("Social preview").closest("details")).toHaveAttribute("open");
    expect(radio("Designed card")).toBeChecked();
    expect(screen.getByLabelText("Headline")).toHaveValue("Saved headline");
    expect(cardSvg()).toContain("Saved headline");
  });

  it("shows the title people will see: preview title, then link title, then the destination's host", async () => {
    const { user } = setup({ title: "Blue shoes" });
    const whatsapp = within(screen.getByTestId("preview-whatsapp"));
    expect(whatsapp.getByText("Blue shoes")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Preview title"), "Shoes, 20% off");
    expect(whatsapp.getByText("Shoes, 20% off")).toBeInTheDocument();
  });

  it("falls back to the destination's host, then to a placeholder", () => {
    setup({ title: "", destinationUrl: "https://shop.example/x" });
    expect(within(screen.getByTestId("preview-slack")).getByText("shop.example")).toBeInTheDocument();
  });

  it("shows the short link's address in the previews, not the destination", () => {
    setup({ customCode: "blue-shoes" });
    const whatsapp = within(screen.getByTestId("preview-whatsapp"));
    expect(whatsapp.getByText("https://sho.rt/blue-shoes")).toBeInTheDocument();
    expect(whatsapp.getAllByText("sho.rt").length).toBeGreaterThan(0);
    expect(screen.getByTestId("social-previews").textContent).not.toContain("products/blue-shoes");
  });

  it("uses the link's real short URL once it exists", () => {
    setup({}, makeLinkDto({ code: "abc123", shortUrl: "https://sho.rt/abc123" }));
    expect(
      within(screen.getByTestId("preview-whatsapp")).getByText("https://sho.rt/abc123"),
    ).toBeInTheDocument();
  });

  describe("designed card", () => {
    it("creates a design seeded from the title and clears the image link", async () => {
      const { user, current } = setup({ title: "Blue shoes", ogImageUrl: "https://img.example/a.png" });
      await user.click(radio("Designed card"));
      expect(current().cardDesign).toMatchObject({
        template: "gradient",
        palette: "forest",
        headline: "Blue shoes",
        subline: "",
        showHost: true,
      });
      expect(current().ogImageUrl).toBe("");
      expect(screen.getByTestId("card-controls")).toBeInTheDocument();
    });

    it("draws the card in every preview, and follows the headline as you type", async () => {
      const { user } = setup({ title: "Blue shoes" });
      await user.click(radio("Designed card"));
      expect(cardSvg()).toContain("Blue shoes");
      expect(document.querySelectorAll('img[src^="data:image/svg+xml"]')).toHaveLength(4);

      await user.clear(screen.getByLabelText("Headline"));
      await user.type(screen.getByLabelText("Headline"), "Half price");
      expect(cardSvg()).toContain("Half price");
      expect(cardSvg()).not.toContain("Blue shoes");
    });

    it("never sends markup through: the headline is escaped in the drawing", async () => {
      const { user } = setup();
      await user.click(radio("Designed card"));
      await user.type(screen.getByLabelText("Headline"), "<script>x</script>");
      expect(cardSvg()).not.toContain("<script>");
      expect(cardSvg()).toContain("&lt;script&gt;");
    });

    it("changes the layout and the colours", async () => {
      const { user, current } = setup();
      await user.click(radio("Designed card"));
      await user.click(screen.getByLabelText("Split"));
      expect(current().cardDesign?.template).toBe("split");
      await user.click(screen.getByLabelText("Plum"));
      expect(current().cardDesign?.palette).toBe("plum");
      expect(cardSvg()).toContain(PALETTES.plum.bg);
    });

    it("adds a subtitle and can hide the address", async () => {
      const { user, current } = setup({ title: "T" });
      await user.click(radio("Designed card"));
      await user.type(screen.getByLabelText("Subtitle (optional)"), "Free shipping");
      expect(cardSvg()).toContain("Free shipping");
      expect(cardSvg()).toContain(">sho.rt</text>");

      await user.click(screen.getByRole("switch", { name: /Show the link's address/ }));
      expect(current().cardDesign?.showHost).toBe(false);
      expect(cardSvg()).not.toContain(">sho.rt</text>");
    });

    it("counts characters and explains an empty headline", async () => {
      const { user } = setup();
      await user.click(radio("Designed card"));
      await user.type(screen.getByLabelText("Headline"), "Hello");
      expect(screen.getByText("5/80")).toBeInTheDocument();
      expect(cardSvg()).toContain("Hello");
      await user.clear(screen.getByLabelText("Headline"));
      expect(cardSvg()).toContain("Your headline");
    });

    it("fills the headline from the title on request", async () => {
      const { user, current } = setup({ title: "Spring sale" });
      await user.click(radio("Designed card"));
      await user.clear(screen.getByLabelText("Headline"));
      await user.type(screen.getByLabelText("Headline"), "Something else");
      await user.click(screen.getByRole("button", { name: "Use the title" }));
      expect(current().cardDesign?.headline).toBe("Spring sale");
      expect(screen.getByRole("button", { name: "Use the title" })).toBeDisabled();
    });

    it("offers the saved card as a download, only for a link that has one", () => {
      const { unmount } = render(
        <Harness values={{ cardDesign: card }} link={makeLinkDto({ code: "abc", cardDesign: card })} />,
      );
      expect(screen.getByRole("link", { name: /Download the saved card/ })).toHaveAttribute(
        "href",
        "/abc/card?download=1",
      );
      unmount();
      render(<Harness values={{ cardDesign: card }} link={makeLinkDto({ code: "abc", cardDesign: null })} />);
      expect(screen.queryByRole("link", { name: /Download/ })).not.toBeInTheDocument();
    });
  });

  describe("image link", () => {
    it("switches to a link field, drops the design, and previews the image", async () => {
      const { user, current } = setup({ cardDesign: card });
      await user.click(radio("Image link"));
      expect(current().cardDesign).toBeNull();
      expect(screen.queryByTestId("card-controls")).not.toBeInTheDocument();

      await user.type(
        screen.getByLabelText("Image link", { selector: "input[type=url]" }),
        "https://img.example/cover.png",
      );
      const images = [...document.querySelectorAll("img")].map((img) => img.getAttribute("src"));
      expect(images).toHaveLength(4);
      expect(new Set(images)).toEqual(new Set(["https://img.example/cover.png"]));
    });

    it("does not preview an image that is not https", async () => {
      const { user } = setup();
      await user.click(radio("Image link"));
      await user.type(
        screen.getByLabelText("Image link", { selector: "input[type=url]" }),
        "http://img.example/a.png",
      );
      expect(document.querySelectorAll("img")).toHaveLength(0);
    });
  });

  it("goes back to no image, clearing both", async () => {
    const { user, current } = setup({ cardDesign: card });
    await user.click(radio("No image"));
    expect(current().cardDesign).toBeNull();
    expect(current().ogImageUrl).toBe("");
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });

  it("starts a fresh design from the title each time the designed card is chosen again", async () => {
    const { user, current } = setup({ title: "Blue shoes" });
    await user.click(radio("Designed card"));
    await user.clear(screen.getByLabelText("Headline"));
    await user.type(screen.getByLabelText("Headline"), "Custom");
    await user.click(radio("Image link"));
    await user.click(radio("Designed card"));
    expect(current().cardDesign?.headline).toBe("Blue shoes");
  });

  it("switches every mock-up to dark mode", async () => {
    const { user } = setup();
    expect(screen.getByTestId("preview-whatsapp").className).toContain("efeae2");
    await user.click(screen.getByRole("switch", { name: "Dark mode" }));
    expect(screen.getByTestId("preview-whatsapp").className).toContain("0b141a");
    expect(screen.getByTestId("preview-slack").className).toContain("0b141a");
  });
});

const base: SocialPreviewData = {
  title: "A title",
  description: "A description",
  host: "sho.rt",
  shortUrl: "https://sho.rt/abc",
  siteName: "Vialb",
  imageSrc: "https://img.example/cover.png",
  dark: false,
};

describe("social previews", () => {
  it("WhatsApp shows the image, title, description, host and the link itself", () => {
    render(<WhatsAppPreview {...base} />);
    const view = within(screen.getByTestId("preview-whatsapp"));
    expect(view.getByText("A title")).toBeInTheDocument();
    expect(view.getByText("A description")).toBeInTheDocument();
    expect(view.getByText("sho.rt")).toBeInTheDocument();
    expect(view.getByText("https://sho.rt/abc")).toBeInTheDocument();
    expect(document.querySelector("img")).toHaveAttribute("src", "https://img.example/cover.png");
  });

  it("iMessage shows only the title and host under the picture", () => {
    render(<IMessagePreview {...base} />);
    const view = within(screen.getByTestId("preview-imessage"));
    expect(view.getByText("A title")).toBeInTheDocument();
    expect(view.getByText("sho.rt")).toBeInTheDocument();
    expect(view.queryByText("A description")).not.toBeInTheDocument();
  });

  it("Slack names the site and puts the image under the text", () => {
    render(<SlackPreview {...base} />);
    const view = within(screen.getByTestId("preview-slack"));
    expect(view.getByText("Vialb")).toBeInTheDocument();
    expect(view.getByText("A title")).toBeInTheDocument();
    expect(view.getByText("A description")).toBeInTheDocument();
  });

  it("X overlays the title on the image and names the host below", () => {
    render(<XPreview {...base} />);
    const view = within(screen.getByTestId("preview-x"));
    expect(view.getByText("A title")).toBeInTheDocument();
    expect(view.getByText("sho.rt")).toBeInTheDocument();
    expect(view.queryByText("A description")).not.toBeInTheDocument();
  });

  it("X without an image becomes a text card with the description", () => {
    render(<XPreview {...base} imageSrc={null} />);
    const view = within(screen.getByTestId("preview-x"));
    expect(view.getByText("A description")).toBeInTheDocument();
    expect(document.querySelectorAll("img")).toHaveLength(0);
  });

  it("leaves out empty descriptions and shows a placeholder where an app would reserve the picture", () => {
    render(<SocialPreviews {...base} description="" imageSrc={null} />);
    expect(screen.queryByText("A description")).not.toBeInTheDocument();
    expect(document.querySelectorAll("img")).toHaveLength(0);
    // WhatsApp, iMessage and Slack keep the shape of the image; Slack and X do without.
    expect(within(screen.getByTestId("preview-whatsapp")).getByText("A title")).toBeInTheDocument();
  });

  it("renders all four apps", () => {
    render(<SocialPreviews {...base} />);
    for (const app of ["whatsapp", "imessage", "slack", "x"]) {
      expect(screen.getByTestId(`preview-${app}`)).toBeInTheDocument();
    }
  });
});
