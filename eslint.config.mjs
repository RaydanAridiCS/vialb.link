import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx,mts}"],
    extends: [tseslint.configs.strict],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    // Layering rule: only the Drizzle repositories, the db client and the
    // scripts may import Drizzle. Everything else goes through interfaces.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/db/**", "src/server/repositories/drizzle/**", "src/server/auth/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["drizzle-orm", "drizzle-orm/*"],
              message:
                "Only src/server/repositories/drizzle/* may import Drizzle. Use a repository interface.",
            },
          ],
        },
      ],
    },
  },
  {
    // shadcn/ui components are generated code; keep them close to upstream.
    files: ["src/components/ui/**"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "src/server/db/migrations/**",
  ]),
]);

export default eslintConfig;
