import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PORT ?? 4173)
const baseURL = `http://localhost:${port}`

// End-to-end tests run the MFE alone in the local shell harness (`platform dev`):
// realistic platform context, command palette, settings host and widgets without a shell.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx platform dev --port ${port}`,
    url: `${baseURL}/__platform/harness/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
