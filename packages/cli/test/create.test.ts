import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { analyzeProjectSources } from "@platform/vite"

import { create, titleCase } from "../src/commands/create"
import { CliError } from "../src/errors"
import { makeTempDir, MONOREPO_ROOT } from "./helpers"

const temp = makeTempDir()
afterAll(() => temp.cleanup())

const read = (dir: string, file: string) => readFileSync(join(dir, file), "utf8")
const json = (dir: string, file: string) => JSON.parse(read(dir, file)) as Record<string, any>

describe("platform create", () => {
  let tecton19: Awaited<ReturnType<typeof create>>
  beforeAll(async () => {
    tecton19 = await create({
      name: "@acme/asset-tracker",
      dir: temp.dir,
      install: false,
      git: false,
    })
  })

  it("scaffolds a project whose sources analyse without a single warning", () => {
    // A new project must build quietly: a warning on the scaffold is a warning
    // every user meets on their first build, with nothing of their own to fix.
    // The template's widget command labels itself from its props
    // (`Open ${title}`), which is the documented pattern, so the analysis has to
    // treat it as ordinary rather than unanalysable.
    const analysis = analyzeProjectSources({ root: tecton19.dir })
    expect(analysis.warnings).toEqual([])
    expect(analysis.widgets.map((widget) => widget.id)).toContain("asset-card")
  })

  it("scaffolds the canonical file map", () => {
    const dir = tecton19.dir
    expect(dir).toBe(join(temp.dir, "asset-tracker"))
    expect(tecton19.mfeId).toBe("asset-tracker")
    expect(tecton19.displayName).toBe("Asset Tracker")
    expect(tecton19.routePrefix).toBe("/asset-tracker")
    for (const file of [
      "package.json",
      "vite.config.ts",
      "mfe.config.ts",
      "tsconfig.json",
      "eslint.config.ts",
      ".prettierrc",
      ".prettierignore",
      ".gitignore",
      ".npmrc",
      "playwright.config.ts",
      "vitest.config.ts",
      "README.md",
      "AGENTS.md",
      "llm.txt",
      "llms.txt",
      ".platform/identity.json",
      "src/styles.css",
      "src/mfe.tsx",
      "src/platform.d.ts",
      "src/routeTree.gen.ts",
      "src/routes/__root.tsx",
      "src/routes/index.tsx",
      "src/routes/settings.tsx",
      "src/routes/assets/index.tsx",
      "src/routes/assets/$assetId.tsx",
      "src/widgets/asset-card.tsx",
      "src/lib/storage.ts",
      "src/lib/api.ts",
      "src/__tests__/mfe.test.tsx",
      "src/__tests__/setup.ts",
      "e2e/harness.spec.ts",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true)
    }
    expect(existsSync(join(dir, "package.json.tmpl"))).toBe(false)
    expect(existsSync(join(dir, "_gitignore"))).toBe(false)
  })

  it("writes the identity file and replaces every token", () => {
    const dir = tecton19.dir
    expect(json(dir, ".platform/identity.json")).toEqual({ mfeId: "asset-tracker" })
    const all = [
      "package.json",
      "mfe.config.ts",
      "src/mfe.tsx",
      "src/routes/__root.tsx",
      "README.md",
      "AGENTS.md",
      "llm.txt",
      "llms.txt",
      "src/__tests__/mfe.test.tsx",
      "src/lib/storage.ts",
    ]
      .map((file) => read(dir, file))
      .join("\n")
    expect(all).not.toMatch(
      /__(MFE_ID|PACKAGE_NAME|DISPLAY_NAME|ROUTE_PREFIX|REACT_MAJOR|REACT_RANGE|TYPES_REACT_RANGE|YEAR|PLATFORM_[A-Z]+_SPEC|TECTON_SPEC)__/
    )
    expect(all).not.toMatch(/\{\{[#^/]/)
    expect(read(dir, "src/routes/__root.tsx")).toContain('breadcrumb: "Asset Tracker"')
    expect(read(dir, "src/__tests__/mfe.test.tsx")).toContain('mfeId: "asset-tracker"')
  })

  it("scaffolds React 19 + Tecton by default", () => {
    const pkg = json(tecton19.dir, "package.json")
    expect(pkg.name).toBe("@acme/asset-tracker")
    expect(pkg.type).toBe("module")
    expect(pkg.scripts).toMatchObject({
      dev: "platform dev",
      build: "platform build",
      lint: "platform lint",
      test: "platform test",
      validate: "platform validate",
      manifest: "platform manifest",
      "test:e2e": "playwright test",
      typecheck: "tsc --noEmit",
    })
    expect(pkg.dependencies.react).toBe("^19.0.0")
    expect(pkg.dependencies["@platform/react"]).toBe("^0.1.0")
    expect(pkg.dependencies["@tecton/react"]).toMatch(/^github:rpkapps\/tecton-ui-1#/)
    expect(pkg.dependencies["react-aria-components"]).toBeDefined()
    expect(pkg.devDependencies["@platform/cli"]).toBe("^0.1.0")
    expect(pkg.devDependencies["@platform/vite"]).toBe("^0.1.0")
    expect(pkg.devDependencies["@platform/host"]).toBe("^0.1.0")
    expect(pkg.devDependencies.jiti).toBeDefined()
    expect(pkg.devDependencies.eslint).toMatch(/\^9/)
    expect(pkg.devDependencies["@types/react"]).toBe("^19.0.0")
    expect(read(tecton19.dir, "src/styles.css")).toContain(
      '@import "@tecton/react/globals.css"'
    )
    expect(read(tecton19.dir, "src/routes/__root.tsx")).toContain(
      "@tecton/react/components/badge"
    )
    expect(read(tecton19.dir, "src/widgets/asset-card.tsx")).toContain("DialogTrigger")
    expect(read(tecton19.dir, "src/widgets/asset-card.tsx")).not.toContain("React.useState")
    expect(read(tecton19.dir, "eslint.config.ts")).toContain("export default platformConfig()")
  })

  it("scaffolds React 18 without Tecton", async () => {
    const result = await create({
      name: "legacy-reports",
      dir: temp.dir,
      react: 18,
      tecton: false,
      install: false,
      git: false,
    })
    const pkg = json(result.dir, "package.json")
    expect(pkg.dependencies.react).toBe("^18.3.1")
    expect(pkg.devDependencies["@types/react"]).toBe("^18.3.0")
    expect(pkg.dependencies["@tecton/react"]).toBeUndefined()
    expect(pkg.dependencies["react-aria-components"]).toBeUndefined()
    expect(read(result.dir, "src/styles.css")).not.toContain("@tecton/react")
    expect(read(result.dir, "src/routes/__root.tsx")).not.toContain("@tecton/react")
    expect(read(result.dir, "src/widgets/asset-card.tsx")).toContain("React.useState")
    expect(read(result.dir, "src/widgets/asset-card.tsx")).not.toContain("DialogTrigger")
    expect(read(result.dir, "README.md")).toContain("React 18")
  })

  it("links the platform packages with --link-platform", async () => {
    const result = await create({
      name: "linked-mfe",
      dir: temp.dir,
      linkPlatform: MONOREPO_ROOT,
      install: false,
      git: false,
    })
    const pkg = json(result.dir, "package.json")
    expect(pkg.dependencies["@platform/react"]).toMatch(
      /^file:.*platform-react.*\.tgz$|^file:.*\/packages\/react$/
    )
    expect(pkg.devDependencies["@platform/vite"]).toMatch(
      /^file:.*platform-vite.*\.tgz$|^file:.*\/packages\/vite$/
    )
    expect(pkg.devDependencies["@platform/cli"]).toMatch(
      /^file:.*platform-cli.*\.tgz$|^file:.*\/packages\/cli$/
    )
    expect(pkg.devDependencies["@platform/host"]).toMatch(
      /^file:.*platform-host.*\.tgz$|^file:.*\/packages\/host$/
    )
    expect(pkg.dependencies["@tecton/react"]).toMatch(
      /^file:.*tecton-react.*\.tgz$|^file:.*\/@tecton\/react$/
    )
    const tecton = pkg.dependencies["@tecton/react"].slice("file:".length)
    expect(existsSync(tecton.startsWith("./") ? join(result.dir, tecton) : tecton)).toBe(true)
  })

  it("refuses a non-empty directory unless --force", async () => {
    await expect(
      create({ name: "asset-tracker", dir: temp.dir, install: false, git: false })
    ).rejects.toMatchObject({ code: "TARGET_NOT_EMPTY" })
    const forced = await create({
      name: "asset-tracker",
      dir: temp.dir,
      install: false,
      git: false,
      force: true,
      displayName: "Forced",
    })
    expect(read(forced.dir, "src/routes/__root.tsx")).toContain('breadcrumb: "Forced"')
  })

  it("rejects invalid names, templates and react majors with actionable errors", async () => {
    await expect(create({ name: "bad name", dir: temp.dir })).rejects.toBeInstanceOf(CliError)
    await expect(create({ name: "x", dir: temp.dir, template: "nope" })).rejects.toMatchObject({
      code: "TEMPLATE_UNKNOWN",
    })
    await expect(create({ name: "x", dir: temp.dir, react: 17 as 18 })).rejects.toMatchObject({
      code: "INVALID_OPTION",
    })
    const error = await create({ name: "x", dir: temp.dir, template: "nope" }).catch(
      (thrown: CliError) => thrown
    )
    expect((error as CliError).format()).toMatch(
      /\[platform:cli:TEMPLATE_UNKNOWN\][\s\S]*hint:[\s\S]*docs: https:\/\/platform\.docs\.local\/docs\/cli/
    )
  })

  it("derives display names", () => {
    expect(titleCase("asset-tracker")).toBe("Asset Tracker")
    expect(titleCase("mfe-1")).toBe("Mfe 1")
  })
})
