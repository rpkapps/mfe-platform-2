import { createRequire } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { afterAll, describe, expect, it } from "vitest"

import { create } from "../src/commands/create"
import { platformConfig } from "../src/eslint"
import { makeTempDir, MONOREPO_ROOT } from "./helpers"

const temp = makeTempDir("platform-create-lint-")
afterAll(() => temp.cleanup())

interface LintMessage {
  ruleId: string | null
  severity: number
  message: string
  line: number
}
interface LintResult {
  filePath: string
  messages: LintMessage[]
  errorCount: number
  warningCount: number
}

/** The monorepo's ESLint (what the scaffold would install), run with the scaffold's `eslint.config.ts` semantics. */
async function lintProject(cwd: string): Promise<LintResult[]> {
  const require = createRequire(join(MONOREPO_ROOT, "package.json"))
  const { ESLint } = (await import(pathToFileURL(require.resolve("eslint")).href)) as {
    ESLint: new (options: Record<string, unknown>) => {
      lintFiles(patterns: string[]): Promise<LintResult[]>
    }
  }
  const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: platformConfig() })
  return eslint.lintFiles(["."])
}

function problems(results: LintResult[], cwd: string): string[] {
  return results.flatMap((result) =>
    result.messages.map(
      (message) =>
        `${result.filePath.slice(cwd.length + 1)}:${message.line} ${message.ruleId ?? "parse"} ${message.message}`
    )
  )
}

describe("platform create → platform lint", () => {
  it("scaffolds a React 19 Tecton project that passes the platform lint configuration without manual setup", async () => {
    const result = await create({
      name: "@acme/well-planner",
      dir: temp.dir,
      linkPlatform: MONOREPO_ROOT,
      install: false,
      git: false,
    })
    const results = await lintProject(result.dir)
    const lintedFiles = results.map((entry) =>
      entry.filePath.slice(result.dir.length + 1).replace(/\\/g, "/")
    )
    expect(lintedFiles).toEqual(
      expect.arrayContaining([
        "src/mfe.tsx",
        "src/routes/index.tsx",
        "src/routes/settings.tsx",
        "mfe.config.ts",
        "eslint.config.ts",
        "src/widgets/well-summary.tsx",
      ])
    )
    expect(lintedFiles).not.toContain("src/routeTree.gen.ts")
    expect(problems(results, result.dir).filter((line) => !line.includes(" parse "))).toEqual(
      []
    )
    expect(results.reduce((sum, entry) => sum + entry.errorCount, 0)).toBe(0)
    expect(results.reduce((sum, entry) => sum + entry.warningCount, 0)).toBe(0)
  })

  it("scaffolds a React 18 plain project that passes as well", async () => {
    const result = await create({
      name: "production-reports",
      dir: temp.dir,
      react: 18,
      tecton: false,
      linkPlatform: MONOREPO_ROOT,
      install: false,
      git: false,
    })
    const results = await lintProject(result.dir)
    expect(problems(results, result.dir)).toEqual([])
  })
})
