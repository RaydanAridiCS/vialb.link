/**
 * Regenerates the README screenshots in docs/images/ from the demo seed, in light and dark.
 *
 *   npm run screenshots   (needs a built app: `npm run build` first)
 *
 * It never touches your development database: it resets a scratch one (SHOTS_DATABASE_URL, default
 * `vialb_shots` on the server DATABASE_URL points at), migrates it, runs `npm run seed` against it,
 * starts `next start` on a free port and drives Chromium through the pages. PNGs are optimised with sharp.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import postgres from "postgres";
import sharp from "sharp";

const DEMO = { email: "demo@vialb.local", password: "demo-password-123" };
const OUT = path.resolve(process.cwd(), "docs/images");
const VIEWPORT = { width: 1360, height: 860 };
const SCHEMES = ["light", "dark"] as const;

function scratchUrl(): string {
  if (process.env.SHOTS_DATABASE_URL) return process.env.SHOTS_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? "postgres://vialb:vialb@localhost:5432/vialb";
  const url = new URL(base);
  url.pathname = "/vialb_shots";
  return url.toString();
}

async function resetDatabase(target: string) {
  const name = decodeURIComponent(new URL(target).pathname.slice(1));
  if (!/^[a-z0-9_]+$/i.test(name)) throw new Error(`Refusing odd database name "${name}"`);
  if (name === new URL(process.env.DATABASE_URL ?? "postgres://x/none").pathname.slice(1)) {
    throw new Error("SHOTS_DATABASE_URL must not be your development database");
  }
  const admin = new URL(target);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe(`drop database if exists ${name} with (force)`);
    await sql.unsafe(`create database ${name}`);
  } finally {
    await sql.end();
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit", shell: process.platform === "win32" });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited ${code}`)),
    );
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, child: ChildProcess) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error("next start exited early");
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("The app did not start in time");
}

async function main() {
  const database = scratchUrl();
  const port = await freePort();
  const baseUrl = `http://localhost:${port}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: database,
    SITE_URL: baseUrl,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "screenshots-secret-screenshots-secret-0000",
    ALLOW_SIGNUPS: "true",
    HEALTH_MONITOR_ENABLED: "true",
    JOBS_ENABLED: "false",
    // The demo must never send mail, whatever the developer's .env says.
    SMTP_HOST: "",
    SMTP_FROM: "",
    LOG_LEVEL: "warn",
    NEXT_TELEMETRY_DISABLED: "1",
  };

  console.log(`[screenshots] resetting ${new URL(database).pathname.slice(1)}`);
  await resetDatabase(database);
  await run("npm", ["run", "db:migrate"], env);
  await run("npm", ["run", "seed"], env);

  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    env,
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  try {
    await waitForServer(`${baseUrl}/api/health?live`, server);

    const sql = postgres(database, { max: 1, onnotice: () => {} });
    const [split] = await sql<{ id: string }[]>`select id from links where code = 'spring-sale'`;
    await sql.end();
    if (!split) throw new Error("The seed did not create the demo links");

    await mkdir(OUT, { recursive: true });
    const browser = await chromium.launch();
    try {
      for (const scheme of SCHEMES) {
        const context = await browser.newContext({
          viewport: VIEWPORT,
          colorScheme: scheme,
          deviceScaleFactor: 1,
        });
        // The app defaults to light and remembers the choice in localStorage (next-themes), so set it there.
        await context.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
        const page = await context.newPage();
        await page.goto(`${baseUrl}/`);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
        await settle(page, path.join(OUT, `landing-${scheme}.png`));

        await page.goto(`${baseUrl}/sign-in`);
        await page.getByLabel("Email").fill(DEMO.email);
        await page.getByLabel("Password", { exact: true }).fill(DEMO.password);
        await page.getByRole("button", { name: "Sign in" }).click();
        await page.waitForURL("**/dashboard");

        await page.goto(`${baseUrl}/dashboard/links`);
        await page.getByTestId("link-row").first().waitFor();
        await settle(page, path.join(OUT, `links-${scheme}.png`));

        await page.goto(`${baseUrl}/dashboard/links/${split.id}`);
        await page.getByTestId("analytics-kpis").waitFor();
        await settle(page, path.join(OUT, `analytics-${scheme}.png`));
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    // Through a shell on Windows `kill()` only stops the shell, so take the whole tree down.
    if (process.platform === "win32" && server.pid) {
      spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      server.kill();
    }
  }
  await writeFile(path.join(OUT, ".gitkeep"), "");
  console.log(`[screenshots] wrote ${OUT}`);
}

/** Lets fonts, charts and animations finish, then saves an optimised PNG. */
async function settle(page: Page, file: string) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  const raw = await page.screenshot({ fullPage: false });
  await sharp(raw).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(file);
  console.log(`[screenshots] ${path.relative(process.cwd(), file)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
