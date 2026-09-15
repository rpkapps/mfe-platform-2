import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { create } from "../src/commands/create"
import {
  defaultExportsCreateMfe,
  hasGeneratedBanner,
  validate,
  type Finding,
} from "../src/commands/validate"
import { makeTempDir } from "./helpers"

const temp = makeTempDir()
afterAll(() => temp.cleanup())

const codes = (findings: Finding[], level: Finding["level"] = "error") =>
  findings
    .filter((finding) => finding.level === level)
    .map((finding) => `${finding.check}:${finding.code}`)

describe("platform validate", () => {
  let dir: string
  beforeAll(async () => {
    dir = (await create({ name: "validated", dir: temp.dir, install: false, git: false })).dir
  })

  it("passes on a freshly scaffolded project (manifest step skipped: no node_modules)", async () => {
    const result = await validate({ cwd: dir, manifest: false })
    expect(codes(result.findings)).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.mfeId).toBe("validated")
    expect(result.checks).toEqual(
      expect.arrayContaining([
        "package.json",
        "bootstrap",
        "routes",
        "identity",
        "config",
        "prefix",
        "routeTree",
        "lint",
      ])
    )
  })

  it("reports every broken check with a code, source and docs link", async () => {
    const broken = join(temp.dir, "broken")
    mkdirSync(join(broken, "src", "routes"), { recursive: true })
    mkdirSync(join(broken, ".platform"), { recursive: true })
    writeFileSync(
      join(broken, "package.json"),
      JSON.stringify({ name: "broken", dependencies: { react: "^19.0.0" } })
    )
    writeFileSync(
      join(broken, ".platform", "identity.json"),
      JSON.stringify({ mfeId: "Not Valid" })
    )
    writeFileSync(
      join(broken, "mfe.config.ts"),
      'export default defineMfeConfig({ routePrefix: "/Bad/", env: { API_TOKEN: { required: true } }, unknownKey: 1 })'
    )
    writeFileSync(
      join(broken, "src", "mfe.tsx"),
      "export const mfe = 1\nexport default { mfe }"
    )
    writeFileSync(join(broken, "src", "routeTree.gen.ts"), "export const routeTree = {}\n")
    const result = await validate({ cwd: broken, manifest: false })
    expect(result.ok).toBe(false)
    const errors = codes(result.findings)
    expect(errors).toContain("package.json:VALIDATION_FAILED")
    expect(errors).toContain("package.json:DEPENDENCY_MISSING")
    expect(errors).toContain("bootstrap:VALIDATION_FAILED")
    expect(errors).toContain("routes:VALIDATION_FAILED")
    expect(errors).toContain("identity:MFE_ID_INVALID")
    expect(errors).toContain("prefix:ROUTE_PREFIX_INVALID")
    expect(errors).toContain("env:RUNTIME_CONFIG_INVALID")
    expect(errors).toContain("config:VALIDATION_FAILED")
    expect(errors).toContain("routeTree:VALIDATION_FAILED")
    const unknown = result.findings.find((finding) => finding.message.includes("unknownKey"))
    expect(unknown?.message).toMatch(/valid keys: mfeId, routePrefix/)
    for (const finding of result.findings) {
      expect(finding.docsUrl).toMatch(/^https:\/\/platform\.docs\.local\/docs\//)
      expect(finding.hint).toBeTruthy()
    }
    expect(codes(result.findings, "warning")).toContain("lint:LINT_FAILED")
  })

  it("detects a stale route tree by regenerating it", async () => {
    const stale = (
      await create({ name: "stale-tree", dir: temp.dir, install: false, git: false })
    ).dir
    rmSync(join(stale, "src", "routes", "settings.tsx"))
    const result = await validate({ cwd: stale, manifest: false })
    expect(result.findings.map((finding) => finding.message)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/differs from what the router generator produces/),
      ])
    )
  })

  it("does not ask a widget library for a router", async () => {
    const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "widget-only-mfe")
    const result = await validate({ cwd: fixture, manifest: false })
    expect(codes(result.findings)).toEqual([])
    expect(
      result.findings.some((finding) => finding.message.includes("@tanstack/react-router"))
    ).toBe(false)
  })

  it("recognises the bootstrap default export shapes", () => {
    expect(
      defaultExportsCreateMfe(
        'import { createMfe } from "@platform/mfe-react"\nexport default createMfe({})'
      )
    ).toBe(true)
    expect(defaultExportsCreateMfe("const mfe = createMfe({})\nexport default mfe")).toBe(true)
    expect(defaultExportsCreateMfe("export default withTecton(createMfe({}))")).toBe(true)
    expect(defaultExportsCreateMfe('export default { kind: "platform-remote" }')).toBe(false)
    expect(defaultExportsCreateMfe("export const x = createMfe({})")).toBe(false)
    expect(hasGeneratedBanner("/* eslint-disable */\n\n// @ts-nocheck\n")).toBe(true)
    expect(hasGeneratedBanner("export const routeTree = {}\n")).toBe(false)
  })
})
