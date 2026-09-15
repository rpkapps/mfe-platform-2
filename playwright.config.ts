import { defineConfig, devices } from "@playwright/test"

// Browser E2E for the conformance applications. `pnpm e2e` builds the remotes,
// serves them statically (production artefacts) and starts the SSR shell; the
// HMR project starts development servers instead. Both run on Windows and Linux CI.
const isCI = !!process.env.CI

export default defineConfig({
  testDir: "test/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "production",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /hmr\.spec\.ts/,
    },
    {
      name: "hmr",
      testMatch: /hmr\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:4110" },
    },
  ],
  globalSetup: "./test/e2e/global-setup.ts",
  globalTeardown: "./test/e2e/global-teardown.ts",
})
