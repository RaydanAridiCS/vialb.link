import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addBioButtonAction,
  checkBioHandleAction,
  deleteBioPageAction,
  removeBioButtonAction,
  reorderBioButtonsAction,
  saveBioProfileAction,
  updateBioButtonAction,
} from "@/features/bio/actions";
import { BioEditor } from "@/features/bio/components/bio-editor";
import { BioPageView } from "@/features/bio/components/bio-page-view";
import { PALETTES } from "@/lib/palettes";
import type { BioButtonDto, BioEditorDto, BioPageDto, BioProfileDto } from "@/server/services/bio.service";
import { router } from "../support/navigation-mock";

vi.mock("@/features/bio/actions", () => ({
  addBioButtonAction: vi.fn(),
  checkBioHandleAction: vi.fn(),
  deleteBioPageAction: vi.fn(),
  removeBioButtonAction: vi.fn(),
  reorderBioButtonsAction: vi.fn(),
  saveBioProfileAction: vi.fn(),
  updateBioButtonAction: vi.fn(),
}));
// Runs the "action" and then the success or error callback, like the real hook does after the server replies.
vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    fn: (input: unknown) => Promise<{ data?: unknown; serverError?: string }>,
    options?: {
      onSuccess?: (arg: { data: unknown; input: unknown }) => void;
      onError?: (arg: { error: { serverError?: string } }) => void;
    },
  ) => ({
    execute: (input: unknown) => {
      void Promise.resolve(fn(input)).then((result) => {
        if (result?.serverError) options?.onError?.({ error: { serverError: result.serverError } });
        else options?.onSuccess?.({ data: result?.data, input });
      });
    },
    isPending: false,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const save = mocked(saveBioProfileAction);
const check = mocked(checkBioHandleAction);
const add = mocked(addBioButtonAction);
const update = mocked(updateBioButtonAction);
const remove = mocked(removeBioButtonAction);
const reorder = mocked(reorderBioButtonsAction);
const deletePage = mocked(deleteBioPageAction);

const profile: BioProfileDto = {
  handle: "alice",
  displayName: "Alice",
  bio: "Maker",
  avatarUrl: null,
  theme: "paper",
  socials: [],
  showBadge: true,
  isPublished: true,
  pageUrl: "https://sho.rt/@alice",
};

function button(id: string, label: string, over: Partial<BioButtonDto> = {}): BioButtonDto {
  return {
    id,
    label,
    isVisible: true,
    position: 0,
    link: {
      id: `link-${id}`,
      code: `code-${id}`,
      shortUrl: `https://sho.rt/code-${id}`,
      destinationUrl: `https://example.com/${id}`,
      clickCount: 3,
      status: "active",
    },
    ...over,
  };
}

function renderEditor(initial: BioEditorDto) {
  render(
    <BioEditor
      initial={initial}
      siteUrl="https://sho.rt"
      suggestion={{ handle: "suggested", displayName: "Suggested Name" }}
    />,
  );
  return userEvent.setup();
}

const page: BioPageDto = {
  handle: "alice",
  displayName: "Alice Example",
  bio: "Line one\nLine two",
  avatarUrl: "https://img.example/a.png",
  theme: "forest",
  socials: [
    { platform: "github", url: "https://github.com/alice" },
    { platform: "email", url: "mailto:me@example.com" },
  ],
  showBadge: true,
  buttons: [
    { id: "b1", label: "My shop", href: "/Abc123" },
    { id: "b2", label: "Blog", href: "/Def456" },
  ],
};

beforeEach(() => {
  for (const fn of [save, check, add, update, remove, reorder, deletePage]) fn.mockReset();
});

describe("BioPageView", () => {
  it("shows the name, handle, bio, social links and buttons", () => {
    render(<BioPageView page={page} />);
    expect(screen.getByRole("heading", { level: 1, name: "Alice Example" })).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.getByText(/Line one/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My shop" })).toHaveAttribute("href", "/Abc123");
    expect(screen.getByRole("link", { name: "Blog" })).toHaveAttribute("href", "/Def456");
  });

  it("opens social links safely in a new tab", () => {
    render(<BioPageView page={page} />);
    const github = screen.getByRole("link", { name: "GitHub" });
    expect(github).toHaveAttribute("href", "https://github.com/alice");
    expect(github).toHaveAttribute("target", "_blank");
    expect(github.getAttribute("rel")).toContain("noopener");
    expect(github.getAttribute("rel")).toContain("nofollow");
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:me@example.com");
  });

  it("uses the chosen palette and keeps the avatar decorative", () => {
    render(<BioPageView page={page} />);
    expect(screen.getByTestId("bio-page")).toHaveStyle({ background: PALETTES.forest.bg });
    const avatar = document.querySelector("img");
    expect(avatar).toHaveAttribute("src", "https://img.example/a.png");
    expect(avatar).toHaveAttribute("alt", "");
    expect(avatar).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("falls back to the handle and an initial when there is no name or picture", () => {
    render(<BioPageView page={{ ...page, displayName: null, avatarUrl: null, bio: null, socials: [] }} />);
    expect(screen.getByRole("heading", { level: 1, name: "@alice" })).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("hides the badge when the owner turned it off", () => {
    const { rerender } = render(<BioPageView page={page} />);
    expect(screen.getByRole("link", { name: /Powered by/ })).toHaveAttribute("href", "/");
    rerender(<BioPageView page={{ ...page, showBadge: false }} />);
    expect(screen.queryByText(/Powered by/)).not.toBeInTheDocument();
  });

  it("renders text as text, never as markup", () => {
    render(
      <BioPageView
        page={{
          ...page,
          displayName: "<img src=x onerror=alert(1)>",
          bio: "<script>alert(1)</script>",
          buttons: [{ id: "x", label: "<b>bold</b>", href: "/x" }],
        }}
      />,
    );
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("link", { name: "<b>bold</b>" })).toBeInTheDocument();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  });

  it("is inert in preview mode: no links to click, no page heading", () => {
    render(<BioPageView page={page} preview />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText("My shop")).toBeInTheDocument();
  });

  it("invites buttons in an empty preview and says nothing on an empty public page", () => {
    const empty = { ...page, buttons: [] };
    const { unmount } = render(<BioPageView page={empty} preview />);
    expect(screen.getByText("Your buttons will appear here.")).toBeInTheDocument();
    unmount();
    render(<BioPageView page={empty} />);
    expect(screen.queryByText("Your buttons will appear here.")).not.toBeInTheDocument();
  });
});

describe("BioEditor before a page exists", () => {
  it("starts from the suggestion, previews it, and keeps buttons locked", () => {
    renderEditor({ profile: null, buttons: [] });
    expect(screen.getByLabelText("Handle")).toHaveValue("suggested");
    expect(screen.getByLabelText("Name")).toHaveValue("Suggested Name");
    expect(within(screen.getByTestId("bio-preview")).getByText("Suggested Name")).toBeInTheDocument();
    expect(screen.getByText("Create your page first, then add buttons here.")).toBeInTheDocument();
    expect(screen.getByLabelText("Button label")).toBeDisabled();
    expect(screen.getByTestId("bio-add-button")).toBeDisabled();
    expect(screen.getByTestId("bio-save")).toHaveTextContent("Create page");
  });

  it("previews edits as you type, including the theme and a social link", async () => {
    const user = renderEditor({ profile: null, buttons: [] });
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Zed");
    expect(within(screen.getByTestId("bio-preview")).getByText("Zed")).toBeInTheDocument();

    await user.click(screen.getByText("Ocean", { exact: true }));
    expect(within(screen.getByTestId("bio-preview")).getByTestId("bio-page")).toHaveStyle({
      background: PALETTES.ocean.bg,
    });

    await user.click(screen.getByRole("button", { name: "Add a social link" }));
    await user.type(screen.getByLabelText("Link 1"), "@zed");
    expect(within(screen.getByTestId("bio-preview")).getByText("Instagram")).toBeInTheDocument();
  });

  it("explains a bad handle instead of sending it", async () => {
    const user = renderEditor({ profile: null, buttons: [] });
    await user.clear(screen.getByLabelText("Handle"));
    await user.type(screen.getByLabelText("Handle"), "admin");
    await user.click(screen.getByTestId("bio-save"));
    expect(await screen.findByText("This handle is reserved, please choose another")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects a social link that points at the wrong site", async () => {
    const user = renderEditor({ profile: null, buttons: [] });
    await user.click(screen.getByRole("button", { name: "Add a social link" }));
    await user.type(screen.getByLabelText("Link 1"), "https://evil.example/alice");
    await user.click(screen.getByTestId("bio-save"));
    expect(await screen.findByText("This does not look like a link to Instagram")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves, drops blank social rows, and unlocks the buttons", async () => {
    save.mockResolvedValue({ data: { profile: { ...profile, handle: "suggested", isPublished: false } } });
    const user = renderEditor({ profile: null, buttons: [] });
    await user.click(screen.getByRole("button", { name: "Add a social link" }));
    await user.click(screen.getByTestId("bio-save"));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0]).toMatchObject({
      handle: "suggested",
      displayName: "Suggested Name",
      theme: "paper",
      socials: [],
      isPublished: false,
      showBadge: true,
    });
    await waitFor(() => expect(screen.getByLabelText("Button label")).toBeEnabled());
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByTestId("bio-save")).toHaveTextContent("Save changes");
  });

  it("shows a server-side handle error on the field", async () => {
    save.mockResolvedValue({ serverError: "This handle is taken" });
    const user = renderEditor({ profile: null, buttons: [] });
    await user.click(screen.getByTestId("bio-save"));
    expect(await screen.findByText("This handle is taken")).toBeInTheDocument();
  });

  it("reports whether a handle is free when you leave the field", async () => {
    check.mockResolvedValue({ data: { available: false, reason: "This handle is taken" } });
    const user = renderEditor({ profile: null, buttons: [] });
    await user.clear(screen.getByLabelText("Handle"));
    await user.type(screen.getByLabelText("Handle"), "taken_one");
    await user.tab();
    expect(await screen.findByText("This handle is taken")).toBeInTheDocument();
    expect(check).toHaveBeenCalledWith({ handle: "taken_one" });
  });

  it("does not ask the server about handles it can already reject", async () => {
    const user = renderEditor({ profile: null, buttons: [] });
    await user.clear(screen.getByLabelText("Handle"));
    await user.type(screen.getByLabelText("Handle"), "no");
    await user.tab();
    expect(check).not.toHaveBeenCalled();
  });
});

describe("BioEditor with a page and buttons", () => {
  const initial: BioEditorDto = {
    profile,
    buttons: [
      button("a", "Alpha"),
      button("b", "Beta", { isVisible: false }),
      button("c", "Gamma", { link: { ...button("c", "x").link, status: "expired", clickCount: 1200 } }),
    ],
  };
  const list = () => within(screen.getByTestId("bio-buttons"));
  const rowOf = (label: string) => list().getByText(label, { exact: true }).closest("li") as HTMLElement;

  it("lists buttons with their clicks and status, and shows only visible ones in the preview", () => {
    renderEditor(initial);
    expect(within(rowOf("Alpha")).getByText("3")).toBeInTheDocument();
    expect(within(rowOf("Gamma")).getByText("1,200")).toBeInTheDocument();
    expect(within(rowOf("Gamma")).getByText("Expired")).toBeInTheDocument();
    expect(within(rowOf("Beta")).getByText("Hidden")).toBeInTheDocument();
    const preview = within(screen.getByTestId("bio-preview"));
    expect(preview.getByText("Alpha")).toBeInTheDocument();
    expect(preview.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("can't move the first button up or the last one down", () => {
    renderEditor(initial);
    expect(screen.getByRole("button", { name: "Move Alpha up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Gamma down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Alpha down" })).toBeEnabled();
  });

  it("reorders and tells the server the new order", async () => {
    reorder.mockResolvedValue({ data: { reordered: true } });
    const user = renderEditor(initial);
    await user.click(screen.getByRole("button", { name: "Move Gamma up" }));
    expect(reorder).toHaveBeenCalledWith({ ids: ["a", "c", "b"] });
    const labels = within(screen.getByTestId("bio-buttons"))
      .getAllByRole("listitem")
      .map((li) => li.querySelector("p.font-medium")?.textContent);
    expect(labels).toEqual(["Alpha", "Gamma", "Beta"]);
  });

  it("puts the order back and says so when the server refuses it", async () => {
    reorder.mockResolvedValue({ serverError: "The order does not match your buttons." });
    const user = renderEditor(initial);
    await user.click(screen.getByRole("button", { name: "Move Gamma up" }));
    await waitFor(() => {
      const labels = within(screen.getByTestId("bio-buttons"))
        .getAllByRole("listitem")
        .map((li) => li.querySelector("p.font-medium")?.textContent);
      expect(labels).toEqual(["Alpha", "Beta", "Gamma"]);
    });
  });

  it("hides and shows a button", async () => {
    update.mockResolvedValue({ data: { button: button("a", "Alpha", { isVisible: false }) } });
    const user = renderEditor(initial);
    await user.click(screen.getByRole("button", { name: "Hide Alpha" }));
    expect(update).toHaveBeenCalledWith({ id: "a", isVisible: false });
    expect(await screen.findByRole("button", { name: "Show Alpha" })).toBeInTheDocument();
    expect(within(screen.getByTestId("bio-preview")).queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("edits label and link in place and checks them first", async () => {
    update.mockResolvedValue({ data: { button: button("a", "Alpha 2") } });
    const user = renderEditor(initial);
    await user.click(screen.getByRole("button", { name: "Edit Alpha" }));
    await user.clear(screen.getByLabelText("Link for Alpha"));
    await user.type(screen.getByLabelText("Link for Alpha"), "not a url");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/valid http/);
    expect(update).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Link for Alpha"));
    await user.type(screen.getByLabelText("Link for Alpha"), "https://example.com/new");
    await user.clear(screen.getByLabelText("Label for Alpha"));
    await user.type(screen.getByLabelText("Label for Alpha"), "Alpha 2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(update).toHaveBeenCalledWith({ id: "a", label: "Alpha 2", url: "https://example.com/new" });
    expect(await list().findByText("Alpha 2")).toBeInTheDocument();
  });

  it("shows the server's reason when an edit is refused", async () => {
    update.mockResolvedValue({ serverError: "This domain is blocked" });
    const user = renderEditor(initial);
    await user.click(screen.getByRole("button", { name: "Edit Alpha" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This domain is blocked")).toBeInTheDocument();
  });

  it("asks before removing a button", async () => {
    remove.mockResolvedValue({ data: { removed: true } });
    const user = renderEditor(initial);
    await user.click(screen.getByRole("button", { name: "Remove Alpha" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(remove).toHaveBeenCalledWith({ id: "a" });
    await waitFor(() => expect(list().queryByText("Alpha", { exact: true })).not.toBeInTheDocument());
  });

  it("adds a button after checking label and link", async () => {
    add.mockResolvedValue({ data: { button: button("n", "Newsletter") } });
    const user = renderEditor(initial);

    await user.click(screen.getByTestId("bio-add-button"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the button a label");
    await user.type(screen.getByLabelText("Button label"), "Newsletter");
    await user.type(screen.getByLabelText("Button link"), "javascript:alert(1)");
    await user.click(screen.getByTestId("bio-add-button"));
    expect(await screen.findByText(/valid http/)).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Button link"));
    await user.type(screen.getByLabelText("Button link"), "https://example.com/news");
    await user.click(screen.getByTestId("bio-add-button"));
    expect(add).toHaveBeenCalledWith({ label: "Newsletter", url: "https://example.com/news" });
    expect(await list().findByText("Newsletter")).toBeInTheDocument();
    expect(screen.getByLabelText("Button label")).toHaveValue("");
  });

  it("shows why a button could not be added", async () => {
    add.mockResolvedValue({ serverError: "A page can have at most 30 buttons" });
    const user = renderEditor(initial);
    await user.type(screen.getByLabelText("Button label"), "One more");
    await user.type(screen.getByLabelText("Button link"), "https://example.com/more");
    await user.click(screen.getByTestId("bio-add-button"));
    expect(await screen.findByRole("alert")).toHaveTextContent("A page can have at most 30 buttons");
  });

  it("deletes the whole page after confirmation", async () => {
    deletePage.mockResolvedValue({ data: { deleted: true } });
    const user = renderEditor(initial);
    await user.click(screen.getByRole("button", { name: "Delete page" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(deletePage).toHaveBeenCalled();
    expect(await screen.findByText("Create your page first, then add buttons here.")).toBeInTheDocument();
  });

  it("offers the public link only while published", () => {
    renderEditor({ ...initial, profile: { ...profile, isPublished: false } });
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open/ })).not.toBeInTheDocument();
    expect(screen.getByText("https://sho.rt/@alice")).toBeInTheDocument();
  });
});
