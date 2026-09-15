import { spawn } from "node:child_process"

import { CliError } from "../errors"
import { loadProjectModule, requireProjectRoot, resolveProjectModule } from "../project"

export interface TestOptions {
  cwd?: string
  watch?: boolean
  coverage?: boolean
  e2e?: boolean
  filters?: string[]
  log?: (message: string) => void
}

export interface TestResult {
  ok: boolean
  failed: number
  mode: "unit" | "e2e"
}

interface VitestNodeModule {
  startVitest(
    cliFilters?: string[],
    options?: Record<string, unknown>,
    viteOverrides?: Record<string, unknown>
  ): Promise<{
    close(): Promise<void>
    state: { getCountOfFailedTests(): number }
    shouldKeepServer(): boolean
  }>
}

function runNode(script: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, stdio: "inherit" })
    child.on("error", reject)
    child.on("exit", (code) => resolvePromise(code ?? 1))
  })
}

function runBinary(command: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    })
    child.on("error", reject)
    child.on("exit", (code) => resolvePromise(code ?? 1))
  })
}

/** `platform test`: the project's Vitest programmatically, or Playwright for `--e2e`. */
export async function test(options: TestOptions = {}): Promise<TestResult> {
  const root = requireProjectRoot(options.cwd ?? process.cwd())
  if (options.e2e) {
    const cli =
      resolveProjectModule(root, "@playwright/test/cli") ??
      resolveProjectModule(root, "playwright/cli")
    const args = ["test", ...(options.filters ?? [])]
    const code = cli
      ? await runNode(cli, args, root)
      : await runBinary("npx", ["playwright", ...args], root)
    if (!cli && code !== 0) {
      throw new CliError({
        code: "TESTS_FAILED",
        message:
          "Playwright is not installed in the project (and `npx playwright test` failed).",
        source: root,
        override: "pnpm add -D @playwright/test && pnpm exec playwright install chromium",
      })
    }
    return { ok: code === 0, failed: code === 0 ? 0 : 1, mode: "e2e" }
  }
  const { startVitest } = await loadProjectModule<VitestNodeModule>(
    root,
    "vitest/node",
    "run unit tests"
  )
  const vitest = await startVitest(options.filters ?? [], {
    root,
    watch: Boolean(options.watch),
    ...(options.coverage ? { coverage: { enabled: true } } : {}),
  })
  if (options.watch && vitest.shouldKeepServer()) return { ok: true, failed: 0, mode: "unit" }
  const failed = vitest.state.getCountOfFailedTests()
  await vitest.close()
  return { ok: failed === 0 && process.exitCode !== 1, failed, mode: "unit" }
}
