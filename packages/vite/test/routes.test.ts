import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  analyzeRouteSource,
  deriveRoutes,
  joinRoutePath,
  listRouteFiles,
  routePathFromFile,
} from "../src/routes"

const fixtures = join(__dirname, "fixtures")

describe("routePathFromFile", () => {
  it.each([
    ["index.tsx", "/"],
    ["settings.tsx", "/settings"],
    ["settings.lazy.tsx", "/settings"],
    ["assets/$assetId.tsx", "/assets/$assetId"],
    ["assets.$assetId.tsx", "/assets/$assetId"],
    ["assets/index.tsx", "/assets"],
    ["assets.index.tsx", "/assets"],
    ["assets/route.tsx", "/assets"],
    ["assets.tsx", "/assets"],
    ["assets/$assetId/edit.tsx", "/assets/$assetId/edit"],
    ["posts.$postId.edit.tsx", "/posts/$postId/edit"],
    ["posts_.$postId.tsx", "/posts/$postId"],
    ["_layout/dashboard.tsx", "/dashboard"],
    ["_layout.dashboard.tsx", "/dashboard"],
    ["_layout.index.tsx", "/"],
    ["(group)/about.tsx", "/about"],
    ["(group)/index.tsx", "/"],
    ["(group).about.tsx", "/about"],
    ["$.tsx", "/$"],
    ["files/$.tsx", "/files/$"],
    ["sitemap[.]xml.tsx", "/sitemap.xml"],
    ["nested/deep/page.jsx", "/nested/deep/page"],
    ["windows\\style\\page.tsx", "/windows/style/page"],
  ])("%s → %s", (file, expected) => {
    expect(routePathFromFile(file)).toBe(expected)
  })

  it.each([
    "__root.tsx",
    "_layout.tsx",
    "(group).tsx",
    "-components/Button.tsx",
    "-helper.tsx",
    "index.test.tsx",
    "styles.css",
    "notes.md",
    "assets/$assetId.spec.tsx",
  ])("skips %s", (file) => {
    expect(routePathFromFile(file)).toBeNull()
  })

  it("joins prefixes and paths", () => {
    expect(joinRoutePath("/sample", "/")).toBe("/sample")
    expect(joinRoutePath("/sample", "/assets/$assetId")).toBe("/sample/assets/$assetId")
    expect(joinRoutePath("/", "/settings")).toBe("/settings")
    expect(joinRoutePath("/", "/")).toBe("/")
  })
})

describe("analyzeRouteSource", () => {
  const source = (name: string) =>
    readFileSync(join(fixtures, "analysis", "routes", name), "utf8")

  it("extracts guards, breadcrumbs, navigation and permission groups from literals", () => {
    const analysis = analyzeRouteSource(source("guarded.tsx"), "guarded.tsx")
    expect(analysis.guarded).toBe(true)
    expect(analysis.breadcrumb).toEqual({ label: "Asset", dynamic: true })
    expect(analysis.navigation).toEqual({
      title: "Asset",
      description: "One asset",
      icon: "box",
      keywords: ["asset"],
      order: 2,
      hidden: true,
    })
    expect(analysis.permissionGroups).toEqual(["assets:read", "assets:write"])
    expect(analysis.warnings).toEqual([])
  })

  it("marks non-literal values as dynamic and warns instead of throwing", () => {
    const analysis = analyzeRouteSource(source("dynamic.tsx"), "dynamic.tsx")
    expect(analysis.guarded).toBe(false)
    expect(analysis.breadcrumb).toEqual({ dynamic: true })
    expect(analysis.navigation).toBeUndefined()
    expect(analysis.permissionGroups).toBeUndefined()
    expect(analysis.warnings.length).toBeGreaterThanOrEqual(2)
  })

  it("handles plain string breadcrumbs, lazy routes and broken sources", () => {
    expect(analyzeRouteSource(source("plain.tsx"), "plain.tsx")).toMatchObject({
      guarded: false,
      breadcrumb: "Plain",
    })
    expect(analyzeRouteSource(source("lazy.lazy.tsx"), "lazy.lazy.tsx")).toMatchObject({
      guarded: false,
    })
    const broken = analyzeRouteSource(
      "export const Route = createFileRoute('/x')({ beforeLoad: () => {}, staticData: { breadcrumb: 'X' } ",
      "broken.tsx"
    )
    expect(broken.guarded).toBe(false)
    expect(broken.warnings.some((warning) => warning.includes("could not parse"))).toBe(true)
  })
})

describe("deriveRoutes", () => {
  const root = join(fixtures, "sample-mfe")

  it("lists leaf route files with derived paths", () => {
    const files = listRouteFiles(join(root, "src/routes"))
    expect(files.map((file) => [file.relative, file.path])).toEqual([
      ["assets/$assetId.tsx", "/assets/$assetId"],
      ["index.tsx", "/"],
      ["settings.tsx", "/settings"],
    ])
  })

  it("produces manifest route metadata with the prefix applied", () => {
    const { routes, hasRoutes, warnings } = deriveRoutes({
      root,
      routesDirectory: join(root, "src/routes"),
      routePrefix: "/sample",
    })
    expect(hasRoutes).toBe(true)
    expect(warnings).toEqual([])
    expect(routes).toEqual([
      {
        path: "/",
        fullPath: "/sample",
        file: "src/routes/index.tsx",
        guarded: false,
        breadcrumb: "Home",
        navigation: {
          title: "Home",
          description: "Landing page",
          order: 1,
          keywords: ["start"],
        },
      },
      {
        path: "/assets/$assetId",
        fullPath: "/sample/assets/$assetId",
        file: "src/routes/assets/$assetId.tsx",
        guarded: false,
        breadcrumb: { dynamic: true },
      },
      {
        path: "/settings",
        fullPath: "/sample/settings",
        file: "src/routes/settings.tsx",
        guarded: true,
        breadcrumb: { label: "Settings", hidden: false },
        permissionGroups: ["sample:admin"],
      },
    ])
  })

  it("reports a missing routes directory", () => {
    const result = deriveRoutes({
      root,
      routesDirectory: join(root, "src/nope"),
      routePrefix: "/x",
    })
    expect(result).toEqual({ routes: [], warnings: [], hasRoutes: false })
  })
})
