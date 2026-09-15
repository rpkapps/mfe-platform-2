import { spawn, type ChildProcess } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { expect, test, type Page } from "@playwright/test"

import { conformanceEnv } from "../../scripts/conformance-env.mjs"
import { waitFor } from "../../scripts/wait-for.mjs"
import { ids, switchProject } from "./helpers"

/**
 * Local development mode 2: an SSR shell in dev with manifest overrides that
 * point at MFE development servers. Editing a component in either remote hot
 * updates it without losing shell or remote state; React 18 and React 19
 * refresh runtimes stay separate.
 */
test.describe.configure({ mode: "serial" })

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const cli = join(root, "packages/cli/dist/bin.js")
const children: ChildProcess[] = []
const edited: [string, string][] = []

function edit(file: string, from: string, to: string) {
  const original = readFileSync(file, "utf8")
  edited.push([file, original])
  writeFileSync(file, original.replace(from, to))
}

test.beforeAll(async () => {
  const env = {
    ...process.env,
    ...conformanceEnv({
      mode: "development",
      ports: {
        wellPlanner: 4301,
        productionReports: 4302,
        subsurfaceWidgets: 4303,
        fieldWidgets: 4304,
      },
    }),
  }
  const start = (cwd: string, args: string[]) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: "pipe" })
    child.stdout?.on("data", (chunk) =>
      process.stdout.write(`[${cwd.split(/[\\/]/).pop()}] ${chunk}`)
    )
    child.stderr?.on("data", (chunk) =>
      process.stderr.write(`[${cwd.split(/[\\/]/).pop()}] ${chunk}`)
    )
    children.push(child)
  }
  start(join(root, "apps/well-planner"), [cli, "dev", "--port", "4301", "--no-open"])
  start(join(root, "apps/production-reports"), [cli, "dev", "--port", "4302", "--no-open"])
  start(join(root, "apps/subsurface-widgets"), [cli, "dev", "--port", "4303", "--no-open"])
  start(join(root, "apps/field-widgets"), [cli, "dev", "--port", "4304", "--no-open"])
  const viteBin = join(root, "node_modules/vite/bin/vite.js")
  start(join(root, "apps/conformance-shell"), [
    viteBin,
    "dev",
    "--port",
    "4110",
    "--strictPort",
  ])
  await waitFor("http://127.0.0.1:4301/platform-manifest.json", { timeoutMs: 120_000 })
  await waitFor("http://127.0.0.1:4302/platform-manifest.json", { timeoutMs: 120_000 })
  await waitFor("http://127.0.0.1:4110/", { timeoutMs: 120_000 })
})

// A remote that fails to mount does so in the browser; without this the CI log
// shows only the assertion timeout and the dev servers stay silent. The shell
// writes its diagnostics stream through the console, so every level is
// forwarded: the mount's own progress is what says where it stopped.
const browserLog: string[] = []

function record(line: string) {
  browserLog.push(line)
  process.stdout.write(`${line}\n`)
}

test.beforeEach(({ page }) => {
  browserLog.length = 0
  page.on("console", (message) => record(`[${message.type()}] ${message.text()}`))
  page.on("pageerror", (error) => record(`[pageerror] ${error.stack ?? error.message}`))
  page.on("requestfailed", (request) =>
    record(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ""}`)
  )
})

/**
 * Waits for a remote's root and, if it never arrives, fails with what the shell
 * rendered and what the browser reported instead of a bare locator timeout.
 */
async function expectMounted(page: Page, testId: string) {
  try {
    await expect(page.getByTestId(testId)).toBeVisible({
      timeout: process.env.CI ? 120_000 : 60_000,
    })
  } catch (error) {
    const body = await page
      .locator("body")
      .innerText({ timeout: 5_000 })
      .catch(() => "<unreadable>")
    throw new Error(
      [
        error instanceof Error ? error.message : String(error),
        `page: ${page.url()}`,
        `body: ${body.replace(/\s+/g, " ").slice(0, 800)}`,
        "browser:",
        ...browserLog.slice(-60),
      ].join("\n")
    )
  }
}

test.afterAll(async () => {
  for (const [file, original] of edited) writeFileSync(file, original)
  for (const child of children) child.kill()
})

test("HMR updates React 19 and React 18 remotes while shell and remote state survive", async ({
  page,
}) => {
  await page.goto("/well-planner")
  await expectMounted(page, ids.wellPlanner.root)
  await expect(page.getByTestId(ids.wellPlanner.hmrLabel)).toHaveText("HMR_LABEL_V1")
  // Shell-owned and MFE-owned state, both of which must survive the update.
  await switchProject(page, "PL 050")
  await page.getByTestId(ids.wellPlanner.counter).click()
  edit(join(root, "apps/well-planner/src/routes/index.tsx"), "HMR_LABEL_V1", "HMR_LABEL_V2")
  await expect(page.getByTestId(ids.wellPlanner.hmrLabel)).toHaveText("HMR_LABEL_V2", {
    timeout: 30_000,
  })
  await expect(page.getByTestId(`${ids.shell.projectSwitch}-value`)).toHaveText(/PL 050/)
  await expect(page.getByTestId(ids.wellPlanner.counter)).toContainText("Comparing 1")

  await page.goto("/dashboard")
  await expectMounted(page, ids.widgets.reportSummary)
  await expect(page.getByTestId(ids.widgets.rigStatus)).toHaveCount(2)
  await page
    .getByTestId(ids.widgets.rigStatus)
    .nth(1)
    .getByTestId(ids.widgets.rigStatusIncrement)
    .click()
  edit(
    join(root, "apps/production-reports/src/widgets/report-summary.tsx"),
    "WIDGET_HMR_V1",
    "WIDGET_HMR_V2"
  )
  await expect(page.getByTestId(ids.widgets.hmrLabel)).toHaveText("WIDGET_HMR_V2", {
    timeout: 30_000,
  })
  // Other roots (React 19 widgets, React 18 counters) kept their state: no full reload happened.
  await expect(
    page.getByTestId(ids.widgets.rigStatus).nth(1).getByTestId(ids.widgets.rigStatusValue)
  ).toHaveText("2")
  await expect(page.getByTestId(ids.widgets.kpiTile)).toHaveCount(2)
})

test("restart-requiring changes produce a clear diagnostic instead of a stale remote", async ({
  page,
}) => {
  await page.goto("/well-planner")
  await expectMounted(page, ids.wellPlanner.root)
  edit(
    join(root, "apps/well-planner/mfe.config.ts"),
    'displayName: "Well Planner"',
    'displayName: "Well Planner (renamed)"'
  )
  await page.goto("/well-planner")
  await expect(page.getByTestId(ids.shell.outlet)).toContainText(
    /DEV_RESTART_REQUIRED|restart/i,
    { timeout: process.env.CI ? 120_000 : 60_000 }
  )
})

test("development remotes are marked HMR-capable, production artefacts are not", async ({
  request,
}) => {
  const dev = await (await request.get("http://127.0.0.1:4301/platform-manifest.json")).json()
  expect(dev.dev?.hmr).toBe(true)
  const prod = await (await request.get("http://127.0.0.1:4201/platform-manifest.json")).json()
  expect(prod.dev).toBeUndefined()
})
