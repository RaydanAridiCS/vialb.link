import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://vialb:vialb@localhost:5432/vialb_e2e";

/**
 * E2E tests run against the production build (`npm run build` first) with a
 * dedicated database that is migrated and wiped in global setup.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    // Liveness only: the web server starts before global setup creates the database.
    url: `${BASE_URL}/api/health?live`,
    // Opt-in only: silently reusing a stale server hides fresh build changes.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      SITE_URL: BASE_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
      ALLOW_ANONYMOUS_LINKS: "false",
      ALLOW_SIGNUPS: "true",
      LOG_LEVEL: "warn",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
