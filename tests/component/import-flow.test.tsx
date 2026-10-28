import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkImportCodesAction, importLinksAction } from "@/features/links/actions";
import { ImportFlow } from "@/features/links/components/import-flow";
import { ImportLinksSheet } from "@/features/links/components/import-links-sheet";
import { downloadText } from "@/lib/download";
import { LIMITS } from "@/lib/constants";
import { router } from "../support/navigation-mock";

vi.mock("@/features/links/actions", () => ({
  importLinksAction: vi.fn(),
  checkImportCodesAction: vi.fn(),
}));
// The real hook wraps a server action; here the "action" is already the mock, called directly.
vi.mock("next-safe-action/hooks", () => ({
  useAction: (fn: (input: unknown) => Promise<unknown>) => ({ executeAsync: fn }),
}));
vi.mock("@/lib/download", () => ({ downloadText: vi.fn() }));

type Row = { row: number; url: string; code: string };
const importAction = vi.mocked(importLinksAction) as unknown as ReturnType<typeof vi.fn>;
const checkAction = vi.mocked(checkImportCodesAction) as unknown as ReturnType<typeof vi.fn>;

/** Default server: creates everything it is sent. */
function createEverything() {
  importAction.mockImplementation(async ({ rows }: { rows: Row[] }) => ({
    data: { results: rows.map((r) => ({ row: r.row, status: "created", code: r.code || `gen${r.row}` })) },
  }));
}

beforeEach(() => {
  importAction.mockReset();
  checkAction.mockReset();
  vi.mocked(downloadText).mockReset();
  checkAction.mockResolvedValue({ data: { taken: [], existing: [] } });
  createEverything();
});

const csv = (...lines: string[]) => new File([lines.join("\n")], "links.csv", { type: "text/csv" });

function setup(onClose = vi.fn(), onBusyChange = vi.fn()) {
  const user = userEvent.setup({ applyAccept: false });
  render(<ImportFlow onBusyChange={onBusyChange} onClose={onClose} />);
  const upload = (file: File) => user.upload(screen.getByLabelText("CSV file"), file);
  return { user, upload, onClose, onBusyChange };
}

const importButton = (count: number) =>
  screen.findByRole("button", { name: new RegExp(`Import ${count} links?`) });

describe("ImportFlow: choosing a file", () => {
  it("explains what columns are understood and offers a sample", () => {
    setup();
    expect(screen.getByText(/custom_code/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download a sample file" })).toBeInTheDocument();
  });

  it("downloads the sample file", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Download a sample file" }));
    expect(downloadText).toHaveBeenCalledWith(
      expect.stringContaining("url,title,custom_code,tags"),
      "vialb-import-sample.csv",
      expect.any(String),
    );
  });

  it.each([
    ["a non-CSV file", () => new File(["x"], "photo.png", { type: "image/png" }), /choose a \.csv file/i],
    ["an empty file", () => new File([""], "empty.csv", { type: "text/csv" }), /empty/i],
    ["a header-only file", () => csv("url,title"), /only has a header/i],
    ["an unclosed quote", () => csv("url,title", 'https://a.example,"oops'), /never closes/i],
  ])("rejects %s with a message", async (_name, makeFile, message) => {
    const { upload } = setup();
    await upload(makeFile());
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: /^Import \d/ })).not.toBeInTheDocument();
  });

  it("rejects a file over the size limit", async () => {
    const { upload } = setup();
    const big = csv("url", "https://a.example");
    Object.defineProperty(big, "size", { value: LIMITS.importMaxBytes + 1 });
    await upload(big);
    expect(await screen.findByRole("alert")).toHaveTextContent(/MB/);
  });

  it("rejects a file with too many rows", async () => {
    const { upload } = setup();
    const lines = Array.from({ length: LIMITS.importMaxRows + 1 }, (_, i) => `https://example.com/${i}`);
    await upload(csv("url", ...lines));
    expect(await screen.findByRole("alert")).toHaveTextContent(/1,000 per import/);
  });

  it("accepts a file dropped on the drop area", async () => {
    setup();
    const dropArea = screen.getByRole("group", { name: "Drop zone" });
    const file = csv("url", "https://a.example");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.drop(dropArea, { dataTransfer: { files: [file] } });
    expect(await importButton(1)).toBeEnabled();
  });
});

describe("ImportFlow: review", () => {
  it("detects the columns, previews rows and checks codes against the server", async () => {
    const { upload } = setup();
    await upload(
      csv(
        "Long URL,Title,Back-half,Tags",
        'https://a.example/1,First,first-one,"promo, menus"',
        "https://a.example/2,,,",
      ),
    );

    expect(await importButton(2)).toBeEnabled();
    expect(screen.getByLabelText(/Destination URL/)).toHaveValue("0");
    expect(screen.getByLabelText("Custom code")).toHaveValue("2");
    expect(screen.getByLabelText("Tags")).toHaveValue("3");
    const rows = screen.getAllByTestId("import-preview-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("first-one")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("promo, menus")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("Ready")).toBeInTheDocument();
    expect(checkAction).toHaveBeenCalledWith({ items: [{ code: "first-one", url: "https://a.example/1" }] });
  });

  it("marks invalid rows and leaves them out of the import count", async () => {
    const { upload } = setup();
    await upload(
      csv(
        "url,title,custom_code",
        "https://ok.example/1,,",
        "ftp://nope.example,,",
        "javascript:alert(1),,",
        "https://ok.example/2,,dashboard",
        "https://ok.example/3,,same-code",
        "https://ok.example/4,,same-code",
      ),
    );

    expect(await importButton(2)).toBeInTheDocument();
    const summary = screen.getByTestId("import-summary-line");
    expect(summary).toHaveTextContent("6 rows");
    expect(summary).toHaveTextContent("2 ready");
    expect(summary).toHaveTextContent("4 with problems");
    expect(screen.getAllByText("Enter a valid http:// or https:// URL")).toHaveLength(2);
    expect(screen.getByText("This code is reserved")).toBeInTheDocument();
    expect(screen.getByText("Same code as row 6")).toBeInTheDocument();
  });

  it("shows only problem rows on request", async () => {
    const { user, upload } = setup();
    await upload(csv("url", "https://ok.example", "nope"));
    await importButton(1);

    await user.click(screen.getByLabelText("Only rows with problems"));

    const rows = screen.getAllByTestId("import-preview-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("nope");
  });

  it("flags codes the server says are taken and recognises already-imported ones", async () => {
    checkAction.mockResolvedValue({ data: { taken: ["taken-code"], existing: ["mine-code"] } });
    const { upload } = setup();
    await upload(
      csv(
        "url,custom_code",
        "https://a.example/1,taken-code",
        "https://a.example/2,mine-code",
        "https://a.example/3,free-code",
      ),
    );

    expect(await importButton(1)).toBeInTheDocument();
    expect(screen.getByText("Code is already taken")).toBeInTheDocument();
    expect(screen.getByText("Already imported")).toBeInTheDocument();
    expect(screen.getByTestId("import-summary-line")).toHaveTextContent("1 already imported");
  });

  it("still lets the user import when the code check fails, and says so", async () => {
    checkAction.mockResolvedValue({ serverError: "boom" });
    const { upload } = setup();
    await upload(csv("url,custom_code", "https://a.example/1,my-code"));

    expect(await importButton(1)).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(/Could not check custom codes/);
  });

  it("asks for the URL column when no header matches, and enables import once one is chosen", async () => {
    const { user, upload } = setup();
    await upload(csv("Website,Notes", "https://a.example/1,x", "https://a.example/2,y"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Choose which column/);
    expect(screen.getByRole("button", { name: /^Import 0 links/ })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText(/Destination URL/), "Website");

    expect(await importButton(2)).toBeEnabled();
    expect(screen.queryByText(/Choose which column/)).not.toBeInTheDocument();
  });

  it("treats a file without a header row as data and lets the user toggle it", async () => {
    const { user, upload } = setup();
    await upload(csv("https://a.example/1,First", "https://a.example/2,Second"));

    expect(await importButton(2)).toBeEnabled();
    expect(screen.getByLabelText("First row contains column names")).not.toBeChecked();

    await user.click(screen.getByLabelText("First row contains column names"));
    expect(screen.getByLabelText("First row contains column names")).toBeChecked();
    expect(screen.getByRole("button", { name: /^Import 0 links/ })).toBeDisabled();
  });

  it("goes back to file selection", async () => {
    const { user, upload } = setup();
    await upload(csv("url", "https://a.example"));
    await importButton(1);

    await user.click(screen.getByRole("button", { name: "Choose a different file" }));

    expect(screen.getByLabelText("CSV file")).toBeInTheDocument();
  });
});

describe("ImportFlow: importing", () => {
  it("sends the validated rows, then summarises what was created", async () => {
    const { user, upload, onBusyChange } = setup();
    await upload(
      csv("url,title,custom_code,tags", "https://a.example/1,One,one-code,x y", "https://a.example/2,,,"),
    );

    await user.click(await importButton(2));

    const summary = await screen.findByTestId("import-summary");
    expect(summary).toHaveTextContent("Created");
    expect(within(summary).getByText("2", { selector: "p" })).toBeInTheDocument();
    expect(importAction).toHaveBeenCalledTimes(1);
    expect(importAction).toHaveBeenCalledWith({
      rows: [
        { row: 2, url: "https://a.example/1", title: "One", code: "one-code", tags: ["x", "y"], folder: "" },
        { row: 3, url: "https://a.example/2", title: "", code: "", tags: [], folder: "" },
      ],
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText("Rows that were not imported")).not.toBeInTheDocument();
  });

  it("sends rows in batches no larger than the limit", async () => {
    const { user, upload } = setup();
    const count = LIMITS.importBatchSize * 2 + 5;
    await upload(csv("url", ...Array.from({ length: count }, (_, i) => `https://a.example/${i}`)));

    await user.click(await importButton(count));
    await screen.findByTestId("import-summary");

    expect(importAction.mock.calls.map(([input]) => input.rows.length)).toEqual([
      LIMITS.importBatchSize,
      LIMITS.importBatchSize,
      5,
    ]);
    expect(importAction.mock.calls[2]?.[0].rows[0].row).toBe(LIMITS.importBatchSize * 2 + 2);
  });

  it("announces progress politely while batches run", async () => {
    let release: (value: unknown) => void = () => {};
    importAction.mockImplementationOnce(
      ({ rows }: { rows: Row[] }) =>
        new Promise((resolve) => {
          release = () =>
            resolve({ data: { results: rows.map((r) => ({ row: r.row, status: "created", code: "x" })) } });
        }),
    );
    const { user, upload } = setup();
    await upload(csv("url", "https://a.example/1", "https://a.example/2"));

    await user.click(await importButton(2));

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Importing… 0 of 2 rows");
    expect(screen.getByRole("progressbar", { name: "Import progress" })).toBeInTheDocument();
    release(null);
    await screen.findByTestId("import-summary");
  });

  it("reports server-side failures per row and offers an error CSV with the original rows", async () => {
    importAction.mockImplementation(async ({ rows }: { rows: Row[] }) => ({
      data: {
        results: rows.map((r) =>
          r.url.endsWith("/bad")
            ? { row: r.row, status: "failed", reason: "This domain is not allowed on this instance" }
            : r.code === "again"
              ? { row: r.row, status: "skipped", code: r.code, reason: "Already imported" }
              : { row: r.row, status: "created", code: "x" },
        ),
      },
    }));
    const { user, upload } = setup();
    await upload(
      csv(
        "url,title,custom_code,tags",
        "https://a.example/ok,,,",
        "https://a.example/bad,Bad one,,promo",
        "https://a.example/again,,again,",
        "not-a-url,Local failure,,",
      ),
    );

    await user.click(await importButton(3));

    const summary = await screen.findByTestId("import-summary");
    const failures = within(summary).getAllByTestId("import-failure-row");
    expect(failures.map((f) => f.textContent)).toEqual([
      expect.stringContaining("3"),
      expect.stringContaining("5"),
    ]);
    expect(failures[0]).toHaveTextContent("This domain is not allowed on this instance");
    expect(failures[1]).toHaveTextContent("Enter a valid http:// or https:// URL");
    expect(within(summary).getByText("Skipped (already imported)").nextSibling).toHaveTextContent("1");

    await user.click(within(summary).getByRole("button", { name: /Download failed rows/ }));

    expect(downloadText).toHaveBeenCalledTimes(1);
    const [text, filename, type] = vi.mocked(downloadText).mock.calls[0] ?? [];
    expect(filename).toBe("import-errors-links.csv");
    expect(type).toMatch(/text\/csv/);
    const lines = String(text).split("\r\n");
    expect(lines[0]).toBe("url,title,custom_code,tags,folder,error,original_row");
    expect(lines).toContain(
      "https://a.example/bad,Bad one,,promo,,This domain is not allowed on this instance,3",
    );
    expect(lines.some((line) => line.startsWith("not-a-url,Local failure"))).toBe(true);
  });

  it("stops when a batch is refused (e.g. rate limited) and lists the rows that were not imported", async () => {
    importAction
      .mockImplementationOnce(async ({ rows }: { rows: Row[] }) => ({
        data: { results: rows.map((r) => ({ row: r.row, status: "created", code: "x" })) },
      }))
      .mockResolvedValueOnce({ serverError: "Too many requests, try again in 12 minutes" });
    const { user, upload } = setup();
    const count = LIMITS.importBatchSize + 3;
    await upload(csv("url", ...Array.from({ length: count }, (_, i) => `https://a.example/${i}`)));

    await user.click(await importButton(count));

    const summary = await screen.findByTestId("import-summary");
    expect(summary).toHaveTextContent("The import stopped early: Too many requests, try again in 12 minutes");
    expect(within(summary).getAllByTestId("import-failure-row")).toHaveLength(3);
    expect(summary).toHaveTextContent("Not imported because Too many requests");
    expect(importAction).toHaveBeenCalledTimes(2);
  });

  it("survives a network failure the same way", async () => {
    importAction.mockRejectedValue(new Error("network down"));
    const { user, upload } = setup();
    await upload(csv("url", "https://a.example/1"));

    await user.click(await importButton(1));

    expect(await screen.findByTestId("import-summary")).toHaveTextContent(
      /connection to the server was lost/,
    );
  });

  it("can be cancelled between batches", async () => {
    const { user, upload } = setup();
    const count = LIMITS.importBatchSize * 3;
    await upload(csv("url", ...Array.from({ length: count }, (_, i) => `https://a.example/${i}`)));
    importAction.mockImplementation(async ({ rows }: { rows: Row[] }) => {
      await user.click(await screen.findByRole("button", { name: "Cancel import" }));
      return { data: { results: rows.map((r) => ({ row: r.row, status: "created", code: "x" })) } };
    });

    await user.click(await importButton(count));

    const summary = await screen.findByTestId("import-summary");
    expect(importAction).toHaveBeenCalledTimes(1);
    expect(summary).toHaveTextContent("you cancelled it");
    expect(within(summary).getAllByTestId("import-failure-row")).toHaveLength(LIMITS.importBatchSize);
  });

  it("starts over with 'Import another file' and closes with 'Done'", async () => {
    const { user, upload, onClose } = setup();
    await upload(csv("url", "https://a.example"));
    await user.click(await importButton(1));
    await screen.findByTestId("import-summary");

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Import another file" }));
    expect(screen.getByLabelText("CSV file")).toBeInTheDocument();
  });
});

describe("ImportLinksSheet", () => {
  it("opens from the toolbar button with a labelled dialog and focus inside", async () => {
    const user = userEvent.setup();
    render(<ImportLinksSheet />);

    await user.click(screen.getByRole("button", { name: "Import CSV" }));

    const dialog = await screen.findByRole("dialog", { name: "Import links from CSV" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(within(dialog).getByRole("button", { name: "Choose a file" })).toBeInTheDocument();
  });

  it("closes with Escape when nothing is running", async () => {
    const user = userEvent.setup();
    render(<ImportLinksSheet />);
    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("cannot be dismissed while an import is running", async () => {
    let release: (value: unknown) => void = () => {};
    importAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: { results: [{ row: 2, status: "created", code: "x" }] } });
        }),
    );
    const user = userEvent.setup({ applyAccept: false });
    render(<ImportLinksSheet />);
    await user.click(screen.getByRole("button", { name: "Import CSV" }));
    await user.upload(await screen.findByLabelText("CSV file"), csv("url", "https://a.example"));
    await user.click(await importButton(1));
    await screen.findByText(/Importing…/);

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    release(null);
    await screen.findByTestId("import-summary");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
