import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { PLATFORM_PROTOCOL_VERSION } from "@platform-internal/core"
import { checkRemoteConformance, MFE_IDS, ROUTE_PREFIXES } from "@platform-internal/conformance"

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const apps = [
  {
    dir: "apps/well-planner",
    mfeId: MFE_IDS.wellPlanner,
    react: 19,
    prefix: ROUTE_PREFIXES.wellPlanner,
    tecton: true,
    kind: "mfe",
  },
  {
    dir: "apps/production-reports",
    mfeId: MFE_IDS.productionReports,
    react: 18,
    prefix: ROUTE_PREFIXES.productionReports,
    tecton: false,
    kind: "mfe",
  },
  {
    dir: "apps/subsurface-widgets",
    mfeId: MFE_IDS.subsurfaceWidgets,
    react: 19,
    prefix: undefined,
    tecton: true,
    kind: "widget-library",
  },
  {
    dir: "apps/field-widgets",
    mfeId: MFE_IDS.fieldWidgets,
    react: 18,
    prefix: undefined,
    tecton: false,
    kind: "widget-library",
  },
]

const missing = apps.filter(
  (app) => !existsSync(join(root, app.dir, "dist", "platform-manifest.json"))
)

describe("built conformance remotes", () => {
  // A directory rename once made this whole file skip silently, so the absence
  // of built remotes is a failure with a name, not a quiet pass.
  it("every remote has been built", () => {
    expect(missing.map((app) => app.dir)).toEqual([])
  })

  for (const app of apps) {
    it(`${app.mfeId} passes the conformance checks`, () => {
      const dist = join(root, app.dir, "dist")
      const files = readdirSync(dist, { recursive: true })
        .map(String)
        .map((file) => file.replace(/\\/g, "/"))
      const css = Object.fromEntries(
        files
          .filter((file) => file.endsWith(".css"))
          .map((file) => [file, readFileSync(join(dist, file), "utf8")])
      )
      const manifest = JSON.parse(readFileSync(join(dist, "platform-manifest.json"), "utf8"))
      const result = checkRemoteConformance({
        manifest,
        files,
        css,
        hostProtocolVersion: PLATFORM_PROTOCOL_VERSION,
      })
      expect(result.findings.filter((f) => f.level === "error")).toEqual([])
      expect(result.manifest).toMatchObject({
        mfeId: app.mfeId,
        kind: app.kind,
        runtime: { react: { major: app.react } },
        tecton: { enabled: app.tecton },
      })
      if (app.prefix) expect(result.manifest?.routePrefix ?? `/${app.mfeId}`).toBe(app.prefix)
      const react = result.manifest?.shared.find((request) => request.name === "react")
      expect(react?.scope).toBe(`react${app.react}`)
      expect(result.manifest?.capabilities).toContain("context")
      expect(files).toContain("remoteEntry.js")
      expect(files).toContain("mf-manifest.json")
    })
  }
  it("widget libraries are hidden from the App Finder but keep their contributions", () => {
    for (const app of apps.filter((candidate) => candidate.kind === "widget-library")) {
      const manifest = JSON.parse(
        readFileSync(join(root, app.dir, "dist", "platform-manifest.json"), "utf8")
      )
      expect(manifest.discoverable).toBe(false)
      expect(manifest.widgets.length).toBeGreaterThan(0)
    }
  })
  it("well-planner declares its routes, guards, commands, settings, help, release notes and env", () => {
    const manifest = JSON.parse(
      readFileSync(join(root, "apps/well-planner/dist/platform-manifest.json"), "utf8")
    )
    expect(manifest.routes.map((route: { fullPath: string }) => route.fullPath)).toEqual(
      expect.arrayContaining([
        "/well-planner",
        "/well-planner/wells",
        "/well-planner/wells/$wellId",
        "/well-planner/settings",
        "/well-planner/settings/custom",
      ])
    )
    const guarded = manifest.routes.find(
      (route: { path: string }) => route.path === "/wells/$wellId"
    )
    expect(guarded.guarded).toBe(true)
    expect(guarded.permissionGroups).toEqual(["wells:read"])
    expect(manifest.commands.map((command: { id: string }) => command.id)).toEqual(
      expect.arrayContaining(["go-to-wells", "increment-counter"])
    )
    expect(manifest.settings.map((group: { key: string }) => group.key)).toEqual(
      expect.arrayContaining(["display", "advanced"])
    )
    expect(manifest.help[0].id).toBe("getting-started")
    expect(manifest.releaseNotes[0].version).toBe("1.0.0")
    expect(Object.keys(manifest.env.keys)).toEqual(
      expect.arrayContaining(["API_BASE_URL", "PAGE_SIZE"])
    )
    expect(manifest.capabilities).toEqual(
      expect.arrayContaining([
        "commands",
        "settings",
        "storage.local",
        "storage.session",
        "telemetry",
        "widgets",
      ])
    )
  })
})
