import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** sha256(ip + userAgent + dailySalt). The raw IP never leaves this function. */
export function visitorHash(ip: string | null, userAgent: string | null, dailySalt: string): string {
  return sha256Hex(`${ip ?? "unknown"}|${userAgent ?? ""}|${dailySalt}`);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** UTC calendar day, e.g. "2026-10-18", used as the salt rotation key. */
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
