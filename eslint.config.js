// @ts-check
// Root lint configuration: TypeScript + React rules for every package; the
// platform's own shareable config (@platform/cli/eslint) is what scaffolded
// MFEs use and is exercised by the conformance MFEs through `platform lint`.
import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    // The conformance MFEs and the scaffold template are linted with the platform config
    // (`platform lint`, see the root lint script); the root config covers everything else.
    ignores: [
      // The example remotes lint with their own flat config (`platform lint`),
      // which carries the platform rules the root config does not load.
      "apps/well-planner/**",
      "apps/production-reports/**",
      "apps/subsurface-widgets/**",
      "apps/field-widgets/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/.output/**",
      "**/.tanstack/**",
      "**/routeTree.gen.ts",
      "**/*.gen.ts",
      "**/.platform/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "packages/cli/templates/**",
      "apps/docs/.source/**",
      "apps/docs/public/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.es2022 } },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-namespace": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "error",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/e2e/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  }
)
