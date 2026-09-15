import { defineConfig } from "vitest/config"

// Every workspace package owns its own vitest config; this file wires them
// into one `pnpm test` run and adds the integration project (package and
// runtime boundaries, run against built packages).
export default defineConfig({
  test: {
    projects: [
      "internal/*/vitest.config.ts",
      "packages/*/vitest.config.ts",
      "apps/well-planner/vitest.config.ts",
      "apps/production-reports/vitest.config.ts",
      "apps/subsurface-widgets/vitest.config.ts",
      "apps/field-widgets/vitest.config.ts",
      "apps/conformance-shell/vitest.config.ts",
      "test/integration/vitest.config.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["internal/*/src/**", "packages/*/src/**"],
    },
  },
})
