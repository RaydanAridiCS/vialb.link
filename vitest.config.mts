import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": r("./src"),
      // `server-only` throws outside React Server environments; tests are server code.
      "server-only": r("./tests/support/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          environment: "node",
          setupFiles: ["tests/support/setup-unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          testTimeout: 60_000,
          hookTimeout: 240_000,
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts"],
      exclude: [
        "src/server/db/migrations/**",
        "src/server/db/client.ts",
        "src/server/container.ts",
        "src/server/auth/**",
        "src/server/http/safe-action.ts",
        "src/server/http/request-context.ts",
        "src/server/http/api.ts",
        "src/server/ports/**",
        "src/server/domain/**",
      ],
      reporter: ["text-summary", "html", "lcov"],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
});
