import { createRequire } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { describe, expect, it } from "vitest"

import plugin, {
  GENERATED_IGNORES,
  platformConfig,
  RECOMMENDED_RULES,
  rules,
} from "../../src/eslint"
import { INVALID_MFE, VALID_MFE } from "./rule-tester"
import { MONOREPO_ROOT } from "../helpers"

interface LintMessage {
  ruleId: string | null
  severity: number
  message: string
}
interface LintResult {
  filePath: string
  messages: LintMessage[]
  errorCount: number
}

async function runEslint(cwd: string, config = platformConfig()): Promise<LintResult[]> {
  const require = createRequire(join(MONOREPO_ROOT, "package.json"))
  const { ESLint } = (await import(pathToFileURL(require.resolve("eslint")).href)) as {
    ESLint: new (options: Record<string, unknown>) => {
      lintFiles(patterns: string[]): Promise<LintResult[]>
    }
  }
  return new ESLint({ cwd, overrideConfigFile: true, overrideConfig: config }).lintFiles(["."])
}

describe("plugin", () => {
  it("exposes meta, rules and the recommended config", () => {
    expect(plugin.meta).toEqual({
      name: "@platform/eslint-plugin",
      version: expect.any(String),
    })
    expect(Object.keys(plugin.rules).sort()).toEqual(Object.keys(rules).sort())
    expect(Object.keys(plugin.rules)).toHaveLength(16)
    expect(plugin.configs.recommended.plugins).toHaveProperty("@platform")
    expect(plugin.configs.recommended.rules).toEqual(RECOMMENDED_RULES)
  })

  it("documents every rule at the linting page with a description and messages", () => {
    for (const [name, rule] of Object.entries(rules)) {
      expect(rule.meta.docs?.url).toBe(`https://platform.docs.local/docs/linting#${name}`)
      expect(rule.meta.docs?.description).toBeTruthy()
      expect(Object.keys(rule.meta.messages).length).toBeGreaterThan(0)
      expect(RECOMMENDED_RULES[`@platform/${name as keyof typeof rules}`]).toMatch(
        /^(error|warn)$/
      )
    }
  })
})

describe("platformConfig", () => {
  it("composes ignores, js, typescript, react-hooks, a11y, router and the platform rules", () => {
    const config = platformConfig()
    const names = config.map((entry) => entry.name)
    expect(names).toContain("@platform/ignores")
    expect(names).toContain("@eslint/js/recommended")
    expect(names).toContain("react-hooks/recommended")
    expect(names).toContain("jsx-a11y/recommended")
    expect(names).toContain("@platform/recommended")
    expect(config[0]?.ignores).toEqual(expect.arrayContaining(GENERATED_IGNORES))
    const plugins = new Set(config.flatMap((entry) => Object.keys(entry.plugins ?? {})))
    expect([...plugins]).toEqual(
      expect.arrayContaining([
        "@typescript-eslint",
        "react-hooks",
        "jsx-a11y",
        "@tanstack/router",
        "@platform",
      ])
    )
    const language = config.find((entry) => entry.name === "@platform/language")
    expect(language?.languageOptions?.globals).toHaveProperty("window")
    expect(language?.languageOptions?.globals).toHaveProperty("process")
  })

  it("supports typed linting, overrides and extra ignores", () => {
    const config = platformConfig({
      typed: true,
      tsconfigRootDir: "/tmp/x",
      rules: { "@platform/require-telemetry-context": "off" },
      ignores: ["src/generated/**"],
      react: false,
      a11y: false,
      tanstackRouter: false,
    })
    expect(config[0]?.ignores).toContain("src/generated/**")
    const language = config.find((entry) => entry.name === "@platform/language")
    expect(language?.languageOptions?.parserOptions).toMatchObject({
      projectService: true,
      tsconfigRootDir: "/tmp/x",
    })
    expect(config.map((entry) => entry.name)).not.toContain("react-hooks/recommended")
    expect(config.map((entry) => entry.name)).not.toContain("jsx-a11y/recommended")
    expect(config.at(-1)).toMatchObject({
      name: "@platform/overrides",
      rules: { "@platform/require-telemetry-context": "off" },
    })
    expect(config.some((entry) => entry.name === "@platform/untyped-scripts")).toBe(true)
  })

  it("passes the valid fixture MFE with zero errors", async () => {
    const results = await runEslint(VALID_MFE)
    const errors = results.flatMap((result) =>
      result.messages
        .filter((message) => message.severity === 2)
        .map((message) => `${result.filePath}: ${message.ruleId} ${message.message}`)
    )
    expect(errors).toEqual([])
    expect(results.map((result) => result.filePath.replace(/\\/g, "/"))).not.toEqual(
      expect.arrayContaining([expect.stringContaining("routeTree.gen.ts")])
    )
  })

  it("fails the invalid fixture MFE with the expected rule ids", async () => {
    const results = await runEslint(INVALID_MFE)
    const ruleIds = new Set(
      results.flatMap((result) => result.messages.map((message) => message.ruleId))
    )
    for (const expected of [
      "@platform/no-raw-browser-storage",
      "@platform/no-direct-module-federation",
      "@platform/no-generated-file-edits",
      "@platform/registration-cleanup",
      "@platform/stable-mfe-id",
      "@platform/valid-settings-definition",
      "@platform/valid-command-definition",
      "@platform/valid-capability-usage",
      "@platform/valid-manifest-config",
      "@platform/no-cross-root-component-passing",
      "@platform/require-telemetry-context",
      "@platform/valid-route-prefix",
      "@platform/valid-mfe-identity",
      "@platform/no-unsupported-dependency-sharing",
      "@platform/no-unsafe-runtime-env-access",
      "@platform/no-direct-mfe-import",
    ]) {
      expect([...ruleIds], expected).toContain(expected)
    }
    expect(results.reduce((sum, result) => sum + result.errorCount, 0)).toBeGreaterThan(10)
  })
})
