/**
 * Development / screenshot seed: a demo user, a dozen sample links and ~30
 * days of synthetic clicks.
 *
 *   npm run seed            (idempotent: skips if the demo user exists)
 *   npm run seed -- --force (wipes the demo user's data and re-seeds)
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { getContainer } from "@/server/container";
import { db, pgClient } from "@/server/db/client";
import { account, clicks, links, user } from "@/server/db/schema";
import type { NewClick } from "@/server/domain/types";
import { sha256Hex } from "@/server/lib/hashing";

const DEMO = { email: "demo@vialb.local", password: "demo-password-123", name: "Demo User" };

const SAMPLE_LINKS = [
  {
    url: "https://github.com/RaydanAridiCS/vialb.link",
    code: "repo",
    title: "Vialb on GitHub",
    weight: 9,
  },
  { url: "https://nextjs.org/docs", code: "next-docs", title: "Next.js documentation", weight: 6 },
  {
    url: "https://www.postgresql.org/docs/17/index.html",
    code: "pg17",
    title: "PostgreSQL 17 manual",
    weight: 4,
  },
  { url: "https://orm.drizzle.team/docs/overview", code: "drizzle", title: "Drizzle ORM", weight: 3 },
  { url: "https://ui.shadcn.com", code: "shadcn", title: "shadcn/ui", weight: 5 },
  { url: "https://www.better-auth.com/docs", code: "auth-docs", title: "Better Auth docs", weight: 2 },
  {
    url: "https://example.com/spring-sale?ref=newsletter",
    code: "spring-sale",
    title: "Spring sale landing page",
    weight: 8,
  },
  {
    url: "https://example.com/webinar/2026",
    code: "webinar",
    title: "Webinar registration",
    weight: 4,
    maxClicks: 500,
  },
  {
    url: "https://example.com/private-deck",
    code: "deck",
    title: "Investor deck (password: demo)",
    weight: 1,
    password: "demo",
  },
  { url: "https://example.com/launch", code: "launch", title: "Product launch", weight: 7 },
  {
    url: "https://example.com/old-campaign",
    code: "old-campaign",
    title: "Expired campaign",
    weight: 2,
    expired: true,
  },
  { url: "https://example.com/careers", code: "careers", title: "We're hiring", weight: 3 },
];

const COUNTRIES = [
  ["US", "New York"],
  ["US", "San Francisco"],
  ["DE", "Berlin"],
  ["GB", "London"],
  ["FR", "Paris"],
  ["LB", "Beirut"],
  ["IN", "Bengaluru"],
  ["BR", "São Paulo"],
  ["JP", "Tokyo"],
  ["CA", "Toronto"],
  ["AE", "Dubai"],
  [null, null],
] as const;
const DEVICES = [
  { deviceType: "desktop", browser: "Chrome", os: "Windows" },
  { deviceType: "desktop", browser: "Safari", os: "macOS" },
  { deviceType: "desktop", browser: "Firefox", os: "Linux" },
  { deviceType: "mobile", browser: "Mobile Safari", os: "iOS" },
  { deviceType: "mobile", browser: "Chrome", os: "Android" },
  { deviceType: "tablet", browser: "Mobile Safari", os: "iOS" },
] as const;
const REFERRERS = [
  null,
  null,
  "news.ycombinator.com",
  "twitter.com",
  "linkedin.com",
  "google.com",
  "reddit.com",
  "github.com",
];
const UTM = [
  null,
  null,
  null,
  { s: "newsletter", m: "email", c: "spring" },
  { s: "twitter", m: "social", c: "launch" },
  { s: "linkedin", m: "social", c: "hiring" },
];
const LANGS = ["en-US", "en-GB", "de-DE", "fr-FR", "ar-LB", "ja-JP", "pt-BR"];

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T;

async function main() {
  const force = process.argv.includes("--force");
  const [existing] = await db.select().from(user).where(eq(user.email, DEMO.email)).limit(1);
  if (existing && !force) {
    console.log(`Demo user already exists (${DEMO.email}). Use --force to re-seed.`);
    return;
  }
  if (existing) {
    await db.delete(user).where(eq(user.id, existing.id)); // cascades to links, clicks, keys
    console.log("Removed previous demo data.");
  }

  const [{ count: userCount } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(user);
  const userId = randomUUID().replace(/-/g, "");
  await db.insert(user).values({
    id: userId,
    name: DEMO.name,
    email: DEMO.email,
    emailVerified: true,
    role: userCount === 0 ? "admin" : "user",
  });
  await db.insert(account).values({
    id: randomUUID().replace(/-/g, ""),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(DEMO.password),
  });

  const { links: linkService } = getContainer();
  const actor = { kind: "user", userId, role: "admin" } as const; // admin: no rate limit
  const now = Date.now();
  const DAY = 86_400_000;
  let totalClicks = 0;

  for (const sample of SAMPLE_LINKS) {
    const { link } = await linkService.create(
      actor,
      {
        destinationUrl: sample.url,
        customCode: sample.code,
        title: sample.title,
        password: sample.password ?? null,
        maxClicks: sample.maxClicks ?? null,
      },
      { ip: null },
    );
    const createdAt = new Date(now - 32 * DAY);
    const batch: NewClick[] = [];
    for (let day = 30; day >= 0; day--) {
      const perDay = Math.max(0, Math.round(sample.weight * (1.5 + Math.sin(day / 3)) * Math.random() * 3));
      for (let i = 0; i < perDay; i++) {
        const [country, city] = pick(COUNTRIES);
        const device = pick(DEVICES);
        const utm = pick(UTM);
        const referrerHost = pick(REFERRERS);
        const isBot = Math.random() < 0.04;
        batch.push({
          linkId: link.id,
          occurredAt: new Date(now - day * DAY - Math.floor(Math.random() * DAY)),
          visitorHash: sha256Hex(`visitor-${Math.floor(Math.random() * 400)}`),
          country,
          region: null,
          city,
          browser: isBot ? null : device.browser,
          browserVersion: null,
          os: isBot ? null : device.os,
          osVersion: null,
          deviceType: isBot ? "bot" : device.deviceType,
          referrerHost,
          referrerUrl: referrerHost ? `https://${referrerHost}/` : null,
          utmSource: utm?.s ?? null,
          utmMedium: utm?.m ?? null,
          utmCampaign: utm?.c ?? null,
          utmTerm: null,
          utmContent: null,
          language: pick(LANGS),
          isBot,
        });
      }
    }
    for (let i = 0; i < batch.length; i += 500) await db.insert(clicks).values(batch.slice(i, i + 500));
    const humans = batch.filter((c) => !c.isBot).length;
    totalClicks += batch.length;
    await db
      .update(links)
      .set({
        clickCount: sample.maxClicks ? Math.min(humans, sample.maxClicks) : humans,
        createdAt,
        ...(sample.expired ? { expiresAt: new Date(now - 2 * DAY) } : {}),
      })
      .where(eq(links.id, link.id));
  }

  console.log(`Seeded ${SAMPLE_LINKS.length} links and ${totalClicks} clicks.`);
  console.log(`Sign in with ${DEMO.email} / ${DEMO.password}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pgClient.end({ timeout: 5 }));
