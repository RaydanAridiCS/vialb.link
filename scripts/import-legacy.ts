/**
 * Imports links exported from the legacy toolkit app (Express + Prisma/SQLite).
 *
 *   npm run import:legacy -- ./legacy-links.json [--dry-run]
 *   npm run import:legacy -- ./legacy-links.csv  [--dry-run]
 *
 * Expected columns (JSON keys or CSV header):
 *   shortCode, originalUrl, title, clicks, isActive, expiresAt, createdAt,
 *   password (bcrypt hash), accessLimit, accessCount, metaTitle,
 *   metaDescription, metaImageUrl, qrCodeColor, userEmail
 *
 * - Users are matched by email; unknown/missing emails go to the first admin.
 * - bcrypt password hashes are kept and transparently upgraded to argon2id on
 *   the first successful unlock.
 * - Base64 / non-https `metaImageUrl` values are dropped.
 * - Click history is not imported (`clicks`/`accessCount` seed click_count).
 * See docs/legacy-import.md for exporting from SQLite with `sqlite3 -json`.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db, pgClient } from "@/server/db/client";
import { links } from "@/server/db/schema";
import { getContainer } from "@/server/container";
import { CUSTOM_CODE_PATTERN, HEX_COLOR_PATTERN, LIMITS, RESERVED_CODES } from "@/lib/constants";
import { parseHttpUrl } from "@/server/lib/url";

type Row = Record<string, unknown>;

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const [header, ...rows] = records.filter((r) => r.some((v) => v !== ""));
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "null" ? null : s;
};
const num = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};
const bool = (v: unknown, fallback: boolean): boolean => {
  const s = str(v)?.toLowerCase();
  if (s === undefined || s === null) return fallback;
  return ["1", "true", "yes", "t"].includes(s);
};
const date = (v: unknown): Date | null => {
  const s = str(v);
  if (s === null) return null;
  const d = /^\d+$/.test(s) ? new Date(Number(s)) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  if (!file) {
    console.error("Usage: npm run import:legacy -- <export.json|export.csv> [--dry-run]");
    process.exitCode = 1;
    return;
  }
  const text = await readFile(path.resolve(file), "utf8");
  const rows: Row[] = file.toLowerCase().endsWith(".csv") ? parseCsv(text) : (JSON.parse(text) as Row[]);
  if (!Array.isArray(rows)) throw new Error("Expected a JSON array of rows");

  const { repos } = getContainer();
  const fallbackOwner = await repos.users.findFirstAdmin();
  if (!fallbackOwner)
    throw new Error("No admin user exists yet. Sign up first (the first user becomes admin).");

  const userCache = new Map<string, string>();
  const summary = { imported: 0, skipped: 0, droppedImages: 0, reasons: new Map<string, number>() };
  const skip = (reason: string) => {
    summary.skipped++;
    summary.reasons.set(reason, (summary.reasons.get(reason) ?? 0) + 1);
  };

  for (const row of rows) {
    const code = str(row.shortCode);
    const destination = str(row.originalUrl);
    if (!code || !CUSTOM_CODE_PATTERN.test(code)) {
      skip("invalid shortCode");
      continue;
    }
    if (RESERVED_CODES.has(code.toLowerCase())) {
      skip("reserved shortCode");
      continue;
    }
    if (!destination || destination.length > LIMITS.urlMaxLength || !parseHttpUrl(destination)) {
      skip("non-http(s) or invalid originalUrl");
      continue;
    }

    const email = str(row.userEmail)?.toLowerCase();
    let ownerId = fallbackOwner.id;
    if (email) {
      if (!userCache.has(email))
        userCache.set(email, (await repos.users.findByEmail(email))?.id ?? fallbackOwner.id);
      ownerId = userCache.get(email) ?? fallbackOwner.id;
    }

    let ogImageUrl = str(row.metaImageUrl);
    if (ogImageUrl && !/^https:\/\//i.test(ogImageUrl)) {
      ogImageUrl = null;
      summary.droppedImages++;
    }
    const passwordHash = str(row.password);
    const qr = str(row.qrCodeColor);

    if (dryRun) {
      summary.imported++;
      continue;
    }
    const inserted = await db
      .insert(links)
      .values({
        code,
        destinationUrl: destination,
        userId: ownerId,
        title: str(row.title)?.slice(0, LIMITS.titleMax) ?? null,
        passwordHash: passwordHash && /^\$2[aby]\$/.test(passwordHash) ? passwordHash : null,
        expiresAt: date(row.expiresAt),
        maxClicks: num(row.accessLimit),
        clickCount: Math.max(num(row.accessCount) ?? 0, num(row.clicks) ?? 0),
        isEnabled: bool(row.isActive, true),
        ogTitle: str(row.metaTitle)?.slice(0, LIMITS.ogTitleMax) ?? null,
        ogDescription: str(row.metaDescription)?.slice(0, LIMITS.ogDescriptionMax) ?? null,
        ogImageUrl,
        qrFgColor: qr && HEX_COLOR_PATTERN.test(qr) ? qr.toUpperCase() : "#000000",
        createdAt: date(row.createdAt) ?? new Date(),
      })
      .onConflictDoNothing({ target: links.code })
      .returning({ id: links.id });
    if (inserted.length === 0) skip("code already exists");
    else summary.imported++;
  }

  console.log(
    `${dryRun ? "[dry run] would import" : "Imported"} ${summary.imported} links, skipped ${summary.skipped}.`,
  );
  for (const [reason, count] of summary.reasons) console.log(`  - ${count} × ${reason}`);
  if (summary.droppedImages) console.log(`  - dropped ${summary.droppedImages} non-https / base64 OG images`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pgClient.end({ timeout: 5 }));
