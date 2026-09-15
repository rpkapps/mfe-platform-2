import { existsSync } from "node:fs"
import { join } from "node:path"

import { CliError } from "../errors"
import { createRequire } from "node:module"

import { loadProjectModule, readProjectModuleVersion, requireProjectRoot, resolveProjectModule } from "../project"

export interface LintOptions {
  cwd?: string
  fix?: boolean
  files?: string[]
  log?: (message: string) => void
}

export interface LintResult {
  errorCount: number
  warningCount: number
  fixableErrorCount: number
  fixableWarningCount: number
  results: unknown[]
  configFile: string
  output: string
}

interface ESLintLike {
  lintFiles(patterns: string[]): Promise<LintFileResult[]>
  loadFormatter(name: string): Promise<{ format(results: LintFileResult[]): string | Promise<string> }>
}

interface LintFileResult {
  filePath: string
  errorCount: number
  warningCount: number
  fixableErrorCount: number
  fixableWarningCount: number
  messages: unknown[]
}

interface ESLintModule {
  ESLint: (new (options: Record<string, unknown>) => ESLintLike) & { outputFixes(results: LintFileResult[]): Promise<void> }
}

const CONFIG_FILES = ["eslint.config.ts", "eslint.config.mts", "eslint.config.cts", "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs"]

export function findEslintConfig(root: string): string | undefined {
  return CONFIG_FILES.map((name) => join(root, name)).find((file) => existsSync(file))
}

/** ESLint imports jiti from its own location; accept it there or in the project. */
function jitiAvailable(root: string): boolean {
  const eslintPackage = resolveProjectModule(root, "eslint/package.json")
  if (eslintPackage) {
    try {
      createRequire(eslintPackage).resolve("jiti")
      return true
    } catch {
      // fall through to the project lookup
    }
  }
  return resolveProjectModule(root, "jiti") !== null
}

function parseVersion(version: string | null): [number, number] {
  const [major = 0, minor = 0] = (version ?? "0.0.0").split(".").map((part) => Number.parseInt(part, 10))
  return [major, minor]
}

/** `platform lint`: the project's ESLint with the project's flat config — exactly what CI runs. */
export async function lint(options: LintOptions = {}): Promise<LintResult> {
  const root = requireProjectRoot(options.cwd ?? process.cwd())
  const log = options.log ?? ((message: string) => console.log(message))
  const configFile = findEslintConfig(root)
  if (!configFile) {
    throw new CliError({
      code: "LINT_FAILED",
      message: `No eslint.config.* found in ${root}.`,
      source: root,
      override: 'create eslint.config.ts: import { platformConfig } from "@platform/cli/eslint"; export default platformConfig()',
    })
  }
  const version = readProjectModuleVersion(root, "eslint")
  const [major, minor] = parseVersion(version)
  if (major < 9) {
    throw new CliError({ code: "DEPENDENCY_MISSING", message: version ? `ESLint ${version} is installed; the platform config needs ESLint 9 (flat config).` : "ESLint is not installed in the project; the platform config needs ESLint 9 (flat config).", source: join(root, "package.json"), override: "pnpm add -D eslint@^9" })
  }
  const flags: string[] = []
  if (/\.[mc]?ts$/.test(configFile)) {
    if (!jitiAvailable(root)) {
      throw new CliError({ code: "DEPENDENCY_MISSING", message: `${configFile} is TypeScript; ESLint loads it with "jiti", which is not installed in the project.`, source: join(root, "package.json"), override: "pnpm add -D jiti" })
    }
    // Native TS config support shipped unflagged in ESLint 9.18.
    if (minor < 18) flags.push("unstable_ts_config")
  }
  const { ESLint } = await loadProjectModule<ESLintModule>(root, "eslint", "lint the project")
  const eslint = new ESLint({ cwd: root, fix: Boolean(options.fix), overrideConfigFile: configFile, ...(flags.length ? { flags } : {}) })
  const patterns = options.files && options.files.length > 0 ? options.files : ["."]
  const results = await eslint.lintFiles(patterns)
  if (options.fix) await ESLint.outputFixes(results)
  const formatter = await eslint.loadFormatter("stylish")
  const output = await formatter.format(results)
  if (output.trim()) log(output)
  const summary = results.reduce(
    (totals, result) => ({
      errorCount: totals.errorCount + result.errorCount,
      warningCount: totals.warningCount + result.warningCount,
      fixableErrorCount: totals.fixableErrorCount + result.fixableErrorCount,
      fixableWarningCount: totals.fixableWarningCount + result.fixableWarningCount,
    }),
    { errorCount: 0, warningCount: 0, fixableErrorCount: 0, fixableWarningCount: 0 }
  )
  if (summary.errorCount === 0) log(`✔ lint passed (${results.length} file${results.length === 1 ? "" : "s"}${summary.warningCount ? `, ${summary.warningCount} warning${summary.warningCount === 1 ? "" : "s"}` : ""}) using ${configFile}`)
  return { ...summary, results, configFile, output }
}
