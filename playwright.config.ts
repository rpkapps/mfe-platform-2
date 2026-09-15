import { existsSync } from "node:fs"

import { defineConfig, devices } from "@playwright/test"

// Browser E2E for the conformance applications. `pnpm e2e` serves the built
// remotes statically (production artefacts) and starts the SSR shell; the HMR
// project starts development servers instead. Both run on Windows and Linux CI.
const isCI = !!process.env.CI
// A preinstalled Chromium (container images that set PLAYWRIGHT_BROWSERS_PATH) is
// used directly when present; otherwise the browser Playwright downloaded is launched.
const chromiumPath =
  process.env.PLATFORM_E2E_CHROMIUM ??
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined)

export default defineConfig({
  testDir: "test/e2e",
  // Every test runs in its own browser context against shared servers, so the
  // production project parallelises; failures surface within seconds, not minutes.
  timeout: 40_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: isCI ? 2 : 4,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
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
      // Spawns development servers once per file; runs serially.
      fullyParallel: false,
      workers: 1,
      timeout: 120_000,
      use: { baseURL: "http://127.0.0.1:4110" },
    },
  ],
  globalSetup: "./test/e2e/global-setup.ts",
  globalTeardown: "./test/e2e/global-teardown.ts",
})
