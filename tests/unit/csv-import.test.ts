import { describe, expect, it } from "vitest";
import {
  cleanCell,
  detectHeader,
  detectMapping,
  extractRows,
  guessHeaderlessMapping,
  normalizeHeader,
  splitTagCell,
} from "@/features/links/import/column-mapping";
import { decodeCsvBytes, detectDelimiter, parseCsv } from "@/features/links/import/csv-parser";
import { buildErrorCsv, errorCsvFilename } from "@/features/links/import/error-csv";
import { applyCodeCheck, rowIsReady, validateRows } from "@/features/links/import/row-validation";
import { csvField } from "@/lib/csv";
import { LIMITS } from "@/lib/constants";

const cells = (text: string) => parseCsv(text).records.map((r) => r.cells);

describe("parseCsv", () => {
  it("reads plain rows with LF, CRLF and lone CR line endings", () => {
    expect(cells("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(cells("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(cells("a,b\r1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a UTF-8 BOM", () => {
    expect(parseCsv("\uFEFFurl,title\nx,y").records[0]?.cells).toEqual(["url", "title"]);
  });

  it("handles quoted cells with commas, newlines and escaped quotes", () => {
    const text = 'url,title\nhttps://a.example,"Hello, ""world""\nsecond line"\nhttps://b.example,plain';
    expect(cells(text)).toEqual([
      ["url", "title"],
      ["https://a.example", 'Hello, "world"\nsecond line'],
      ["https://b.example", "plain"],
    ]);
  });

  it("keeps a quote that appears in the middle of an unquoted cell", () => {
    expect(cells('5" nails,x')).toEqual([['5" nails', "x"]]);
  });

  it("skips blank lines and rows of only empty cells, but still counts them in row numbers", () => {
    const { records } = parseCsv("url\n\nhttps://a.example\n,,\n\nhttps://b.example\n");
    expect(records.map((r) => [r.row, r.cells[0]])).toEqual([
      [1, "url"],
      [3, "https://a.example"],
      [6, "https://b.example"],
    ]);
  });

  it("keeps empty cells so columns stay aligned", () => {
    expect(cells("a,,c\n,b,")).toEqual([
      ["a", "", "c"],
      ["", "b", ""],
    ]);
  });

  it("does not need a trailing newline", () => {
    expect(cells("a,b\n1,2")).toHaveLength(2);
    expect(cells("")).toEqual([]);
    expect(cells("\n\n")).toEqual([]);
  });

  it("detects semicolons (European Excel) and tabs", () => {
    expect(detectDelimiter("url;title;tags\nx;y;z")).toBe(";");
    expect(detectDelimiter("url\ttitle\nx\ty")).toBe("\t");
    expect(detectDelimiter("url,title;x")).toBe(",");
    expect(detectDelimiter("single")).toBe(",");
    expect(cells("url;title\nhttps://a.example;Hi, there")).toEqual([
      ["url", "title"],
      ["https://a.example", "Hi, there"],
    ]);
  });

  it("ignores delimiters inside quotes when detecting", () => {
    expect(detectDelimiter('"a;b;c;d",e,f')).toBe(",");
  });

  it("reads an unterminated quote to the end and reports it", () => {
    const result = parseCsv('url,title\nhttps://a.example,"never closed\nhttps://b.example,x');
    expect(result.unterminatedQuote).toBe(true);
    expect(result.records).toHaveLength(2);
    expect(result.records[1]?.cells[1]).toContain("https://b.example");
  });

  it("copes with a huge cell and many rows without blowing up", () => {
    const big = "x".repeat(500_000);
    expect(parseCsv(`url\n${big}`).records[1]?.cells[0]).toHaveLength(500_000);
    const many = Array.from({ length: 20_000 }, (_, i) => `https://e.example/${i}`).join("\n");
    expect(parseCsv(`url\n${many}`).records).toHaveLength(20_001);
  });

  it("round-trips whatever csvField writes", () => {
    const nasty = ["a,b", 'he said "hi"', "two\nlines", "=SUM(A1)", "plain", "", "日本語", "tab\there"];
    const text = nasty.map(csvField).join(",");
    const read = parseCsv(text).records[0]?.cells.map(cleanCell);
    expect(read).toEqual(nasty.map((value) => cleanCell(value)));
  });
});

describe("decodeCsvBytes", () => {
  it("decodes UTF-8", () => {
    expect(decodeCsvBytes(new TextEncoder().encode("café,日本"))).toBe("café,日本");
  });

  it("falls back to windows-1252 for Excel files that are not UTF-8", () => {
    const bytes = Uint8Array.from([0x63, 0x61, 0x66, 0xe9]); // "café" in windows-1252
    expect(decodeCsvBytes(bytes)).toBe("café");
  });
});

describe("column mapping", () => {
  it("normalizes header spelling", () => {
    expect(normalizeHeader(" Long URL ")).toBe("long_url");
    expect(normalizeHeader("Back-Half")).toBe("back_half");
    expect(normalizeHeader("long.url")).toBe("long_url");
    expect(normalizeHeader("\uFEFFURL")).toBe("url");
  });

  it.each([
    [["url", "title", "custom_code", "tags"], { url: 0, title: 1, code: 2, tags: 3, folder: null }],
    [["Destination", "Name", "Slug", "Labels"], { url: 0, title: 1, code: 2, tags: 3, folder: null }],
    [["long_url", "Short URL", "Back Half", "Tag"], { url: 0, title: null, code: 2, tags: 3, folder: null }],
    [["LINK", "Keyword"], { url: 0, title: null, code: 1, tags: null, folder: null }],
    [["Target", "Short_Code", "TITLE"], { url: 0, title: 2, code: 1, tags: null, folder: null }],
    [["foo", "bar"], { url: null, title: null, code: null, tags: null, folder: null }],
  ])("detects columns in %j", (headers, expected) => {
    expect(detectMapping(headers)).toEqual(expected);
  });

  it("uses each column only once", () => {
    // "link" and "url" are both URL aliases; the second one must not also be picked for another field
    const mapping = detectMapping(["url", "link", "title"]);
    expect(mapping.url).toBe(0);
    expect(mapping.title).toBe(2);
  });

  it("tells header rows from data rows", () => {
    expect(detectHeader(["url", "title"])).toBe(true);
    expect(detectHeader(["Whatever", "Stuff"])).toBe(true);
    expect(detectHeader(["https://example.com", "My link"])).toBe(false);
    expect(detectHeader(undefined)).toBe(true);
    expect(guessHeaderlessMapping(["My link", "https://example.com"]).url).toBe(1);
    expect(guessHeaderlessMapping(["nothing"]).url).toBeNull();
  });

  it("splits tag cells on commas, semicolons, pipes and spaces, normalizing as it goes", () => {
    expect(splitTagCell("promo, Client Work;menus|  #spring ")).toEqual([
      "promo",
      "client",
      "work",
      "menus",
      "spring",
    ]);
    expect(splitTagCell("")).toEqual([]);
    expect(splitTagCell(" ,, ; ")).toEqual([]);
  });

  it("strips the formula-injection apostrophe our export adds, but not a normal one", () => {
    expect(cleanCell("'=HYPERLINK(1)")).toBe("=HYPERLINK(1)");
    expect(cleanCell("'+1234")).toBe("+1234");
    expect(cleanCell("'-x")).toBe("-x");
    expect(cleanCell("'@home")).toBe("@home");
    expect(cleanCell("'hello")).toBe("'hello");
    expect(cleanCell("  spaced  ")).toBe("spaced");
  });

  it("extracts rows with the mapping, original row numbers and cleaned cells", () => {
    const { records } = parseCsv(
      'Long URL,Title,Back-half,Tags\nhttps://a.example, A ,promo-a,"x, y"\n\n\'=https://b.example,,,\n',
    );
    const rows = extractRows(records, detectMapping(records[0]?.cells ?? []), true);
    expect(rows).toEqual([
      { row: 2, url: "https://a.example", title: "A", code: "promo-a", tags: ["x", "y"], folder: "" },
      { row: 4, url: "=https://b.example", title: "", code: "", tags: [], folder: "" },
    ]);
  });

  it("extracts every record when the file has no header, and tolerates short rows", () => {
    const { records } = parseCsv("https://a.example\nhttps://b.example,extra");
    const rows = extractRows(records, { url: 0, title: 1, code: null, tags: null, folder: null }, false);
    expect(rows.map((r) => [r.row, r.url, r.title])).toEqual([
      [1, "https://a.example", ""],
      [2, "https://b.example", "extra"],
    ]);
  });
});

describe("validateRows", () => {
  const row = (over: Partial<Parameters<typeof validateRows>[0][number]> = {}) => ({
    row: 2,
    url: "https://example.com/page",
    title: "",
    code: "",
    tags: [],
    folder: "",
    ...over,
  });
  const issues = (over: Parameters<typeof row>[0]) => validateRows([row(over)])[0]?.issues ?? [];

  it("accepts a clean row", () => {
    const [result] = validateRows([row({ title: "Hi", code: "my-code", tags: ["a", "b"] })]);
    expect(result?.issues).toEqual([]);
    expect(result && rowIsReady(result)).toBe(true);
  });

  it("flags a missing URL, an unsupported scheme and garbage", () => {
    expect(issues({ url: "" })).toEqual([{ field: "url", message: "Missing URL" }]);
    expect(issues({ url: "ftp://example.com" })[0]?.field).toBe("url");
    expect(issues({ url: "javascript:alert(1)" })[0]?.field).toBe("url");
    expect(issues({ url: "not a url" })[0]?.field).toBe("url");
    expect(issues({ url: `https://example.com/${"a".repeat(LIMITS.urlMaxLength)}` })[0]?.field).toBe("url");
  });

  it("flags an over-long title", () => {
    expect(issues({ title: "x".repeat(LIMITS.titleMax + 1) })[0]?.field).toBe("title");
    expect(issues({ title: "x".repeat(LIMITS.titleMax) })).toEqual([]);
  });

  it("flags invalid and reserved custom codes", () => {
    expect(issues({ code: "ab" })[0]?.field).toBe("code");
    expect(issues({ code: "has space" })[0]?.field).toBe("code");
    expect(issues({ code: "dashboard" })[0]).toMatchObject({
      field: "code",
      message: "This code is reserved",
    });
    expect(issues({ code: "API" })[0]?.field).toBe("code");
  });

  it("flags duplicate codes inside the file, pointing at the first row", () => {
    const results = validateRows([
      row({ row: 2, code: "same" }),
      row({ row: 3, code: "other" }),
      row({ row: 4, code: "same" }),
      row({ row: 5, code: "Same" }),
    ]);
    expect(results.map((r) => r.issues.length)).toEqual([0, 0, 1, 0]);
    expect(results[2]?.issues[0]?.message).toBe("Same code as row 2");
  });

  it("drops invalid tags into an issue and keeps the valid ones normalized", () => {
    const [result] = validateRows([row({ tags: ["Promo", "bad$tag", "promo", "x".repeat(31)] })]);
    expect(result?.tags).toEqual(["promo"]);
    expect(result?.issues[0]?.field).toBe("tags");
    expect(result?.issues[0]?.message).toMatch(/Invalid tags/);
  });

  it("flags more than the allowed number of tags", () => {
    const tags = Array.from({ length: LIMITS.tagsPerLinkMax + 1 }, (_, i) => `t${i}`);
    expect(issues({ tags })[0]).toMatchObject({ field: "tags" });
  });

  it("reports all problems of a row together", () => {
    expect(issues({ url: "", code: "a", title: "x".repeat(200) }).map((i) => i.field)).toEqual([
      "url",
      "title",
      "code",
    ]);
  });
});

describe("applyCodeCheck", () => {
  const base = validateRows([
    { row: 2, url: "https://a.example", title: "", code: "free", tags: [], folder: "" },
    { row: 3, url: "https://b.example", title: "", code: "taken1", tags: [], folder: "" },
    { row: 4, url: "https://c.example", title: "", code: "mine", tags: [], folder: "" },
    { row: 5, url: "https://d.example", title: "", code: "", tags: [], folder: "" },
    { row: 6, url: "https://e.example", title: "", code: "ab", tags: [], folder: "" },
  ]);

  it("turns taken codes into issues and marks identical own links as already imported", () => {
    const checked = applyCodeCheck(base, { taken: new Set(["taken1", "ab"]), existing: new Set(["mine"]) });
    expect(checked[0] && rowIsReady(checked[0])).toBe(true);
    expect(checked[1]?.issues.at(-1)).toEqual({ field: "code", message: "Code is already taken" });
    expect(checked[2]?.alreadyImported).toBe(true);
    expect(checked[2] && rowIsReady(checked[2])).toBe(false);
    expect(checked[3] && rowIsReady(checked[3])).toBe(true);
    // a row that is already invalid keeps its original code issue instead of getting a second one
    expect(checked[4]?.issues).toHaveLength(1);
  });
});

describe("error CSV", () => {
  it("writes the importer's own column names and keeps the original row", () => {
    const csv = buildErrorCsv([
      {
        row: 7,
        url: "https://a.example",
        title: "A, B",
        code: "dup",
        tags: ["x", "y"],
        folder: "",
        reason: "Code is already taken",
      },
    ]);
    expect(csv.split("\r\n")[0]).toBe("url,title,custom_code,tags,folder,error,original_row");
    expect(csv).toContain('https://a.example,"A, B",dup,x y,,Code is already taken,7');
  });

  it("guards formula-looking cells and can be re-imported without them", () => {
    const csv = buildErrorCsv([
      {
        row: 2,
        url: "=cmd|' /C calc'!A0",
        title: "+evil",
        code: "",
        tags: [],
        folder: "",
        reason: "Enter a valid http:// or https:// URL",
      },
    ]);
    expect(csv).toContain("'=cmd");
    expect(csv).toContain("'+evil");

    const parsed = parseCsv(csv);
    const mapping = detectMapping(parsed.records[0]?.cells ?? []);
    expect(mapping).toEqual({ url: 0, title: 1, code: 2, tags: 3, folder: 4 });
    const [reimported] = extractRows(parsed.records, mapping, true);
    expect(reimported).toMatchObject({ url: "=cmd|' /C calc'!A0", title: "+evil" });
  });

  it("builds a safe download file name", () => {
    expect(errorCsvFilename("My links (1).csv")).toBe("import-errors-My-links-1.csv");
    expect(errorCsvFilename("../../etc/passwd")).toBe("import-errors-etc-passwd.csv");
    expect(errorCsvFilename("C:\\temp\\a b.txt")).toBe("import-errors-C-temp-a-b.csv");
    expect(errorCsvFilename("日本語.csv")).toBe("import-errors.csv");
    expect(errorCsvFilename("x".repeat(200) + ".csv").length).toBeLessThanOrEqual(60);
  });
});

describe("import: folder column", () => {
  it("detects the column by its usual names and reads it", () => {
    for (const header of ["folder", "Folder Name", "group", "Collection"]) {
      expect(detectMapping(["url", header]).folder, header).toBe(1);
    }
    const { records } = parseCsv("url,folder\nhttps://a.example,  Spring   sale \n");
    const rows = extractRows(records, detectMapping(records[0]?.cells ?? []), true);
    expect(rows[0]?.folder).toBe("Spring   sale");
  });

  it("normalizes the name and rejects unusable ones with a row issue", () => {
    const row = (folder: string) => ({
      row: 2,
      url: "https://a.example",
      title: "",
      code: "",
      tags: [],
      folder,
    });
    const [spaced, blank, long, control] = validateRows([
      row("  Spring   sale "),
      row("   "),
      row("x".repeat(41)),
      row("bad\u0007name"),
    ]);
    expect(spaced).toMatchObject({ folder: "Spring sale", issues: [] });
    expect(blank).toMatchObject({ folder: "", issues: [] });
    expect(long?.issues[0]).toMatchObject({ field: "folder" });
    expect(control?.issues[0]).toMatchObject({ field: "folder" });
  });

  it("travels in the error CSV so a corrected file can be uploaded again", () => {
    const csv = buildErrorCsv([
      {
        row: 4,
        url: "https://a.example",
        title: "",
        code: "",
        tags: [],
        folder: "Spring sale",
        reason: "nope",
      },
    ]);
    expect(csv.split("\r\n")[0]).toBe("url,title,custom_code,tags,folder,error,original_row");
    expect(csv).toContain("Spring sale,nope,4");
  });
});
