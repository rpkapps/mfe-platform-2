import { spawn, type ChildProcess } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test } from "@playwright/test"

import { conformanceEnv } from "../../scripts/conformance-env.mjs"
import { waitFor } from "../../scripts/wait-for.mjs"
import { ids } from "./helpers"

/**
 * Local development mode 2: an SSR shell in dev with manifest overrides that
 * point at MFE development servers. Editing a component in either remote hot
 * updates it without losing shell or remote state; React 18 and React 19
 * refresh runtimes stay separate.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const shell = process.platform === "win32"
const cli = join(root, "packages/cli/dist/bin.js")
const children: ChildProcess[] = []
const edited: [string, string][] = []

function edit(file: string, from: string, to: string) {
  const original = readFileSync(file, "utf8")
  edited.push([file, original])
  writeFileSync(file, original.replace(from, to))
}

test.beforeAll(async () => {
  const env = { ...process.env, ...conformanceEnv({ mode: "development", ports: { assetTracker: 4301, legacyReports: 4302, widgetA: 4303, widgetB: 4304 } }) }
  const start = (cwd: string, args: string[]) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: "pipe", shell })
    child.stdout?.on("data", (chunk) => process.stdout.write(`[${cwd.split(/[\\/]/).pop()}] ${chunk}`))
    child.stderr?.on("data", (chunk) => process.stderr.write(`[${cwd.split(/[\\/]/).pop()}] ${chunk}`))
    children.push(child)
  }
  start(join(root, "apps/conformance-react19"), [cli, "dev", "--port", "4301", "--no-open"])
  start(join(root, "apps/conformance-react18"), [cli, "dev", "--port", "4302", "--no-open"])
  start(join(root, "apps/conformance-widget-a"), [cli, "dev", "--port", "4303", "--no-open"])
  start(join(root, "apps/conformance-widget-b"), [cli, "dev", "--port", "4304", "--no-open"])
  const viteBin = join(root, "node_modules/vite/bin/vite.js")
  start(join(root, "apps/conformance-shell"), [viteBin, "dev", "--port", "4110", "--strictPort"])
  await waitFor("http://127.0.0.1:4301/platform-manifest.json", { timeoutMs: 120_000 })
  await waitFor("http://127.0.0.1:4302/platform-manifest.json", { timeoutMs: 120_000 })
  await waitFor("http://127.0.0.1:4110/", { timeoutMs: 120_000 })
})

test.afterAll(async () => {
  for (const [file, original] of edited) writeFileSync(file, original)
  for (const child of children) child.kill()
})

test("HMR updates React 19 and React 18 remotes while shell and remote state survive", async ({ page }) => {
  await page.goto("/asset-tracker")
  await expect(page.getByTestId(ids.assetTracker.root)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId(ids.assetTracker.hmrLabel)).toHaveText("HMR_LABEL_V1")
  await page.getByTestId(ids.shell.counter).click()
  await page.getByTestId(ids.assetTracker.counter).click()
  edit(join(root, "apps/conformance-react19/src/routes/index.tsx"), "HMR_LABEL_V1", "HMR_LABEL_V2")
  await expect(page.getByTestId(ids.assetTracker.hmrLabel)).toHaveText("HMR_LABEL_V2", { timeout: 30_000 })
  await expect(page.getByTestId(ids.shell.counter)).toContainText("Shell 1")
  await expect(page.getByTestId(ids.assetTracker.counter)).toContainText("Counter 1")

  await page.goto("/dashboard")
  await expect(page.getByTestId(ids.widgets.reportSummary)).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId(ids.widgets.counterWidget)).toHaveCount(2)
  await page.getByTestId(ids.widgets.counterWidget).nth(1).getByTestId(ids.widgets.counterWidgetIncrement).click()
  edit(join(root, "apps/conformance-react18/src/widgets/report-summary.tsx"), "WIDGET_HMR_V1", "WIDGET_HMR_V2")
  await expect(page.getByTestId(ids.widgets.hmrLabel)).toHaveText("WIDGET_HMR_V2", { timeout: 30_000 })
  // Other roots (React 19 widgets, React 18 counters) kept their state: no full reload happened.
  await expect(page.getByTestId(ids.widgets.counterWidget).nth(1).getByTestId(ids.widgets.counterWidgetValue)).toHaveText("2")
  await expect(page.getByTestId(ids.widgets.kpiTile)).toHaveCount(2)
})

test("restart-requiring changes produce a clear diagnostic instead of a stale remote", async ({ page }) => {
  await page.goto("/asset-tracker")
  await expect(page.getByTestId(ids.assetTracker.root)).toBeVisible({ timeout: 60_000 })
  edit(join(root, "apps/conformance-react19/mfe.config.ts"), 'displayName: "Asset Tracker"', 'displayName: "Asset Tracker (renamed)"')
  await page.goto("/asset-tracker")
  await expect(page.getByTestId(ids.shell.outlet)).toContainText(/DEV_RESTART_REQUIRED|restart/i, { timeout: 60_000 })
})

test("development remotes are marked HMR-capable, production artefacts are not", async ({ request }) => {
  const dev = await (await request.get("http://127.0.0.1:4301/platform-manifest.json")).json()
  expect(dev.dev?.hmr).toBe(true)
  const prod = await (await request.get("http://127.0.0.1:4201/platform-manifest.json")).json()
  expect(prod.dev).toBeUndefined()
})
