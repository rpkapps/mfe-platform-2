import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"

import { validateManifest } from "@platform-internal/core"
import { afterAll, describe, expect, it } from "vitest"

import { renderEntry } from "../src/entry"
import { generateManifest, writeManifestCopy } from "../src/manifest"
import { computeConfigHash, configFingerprint } from "../src/plugin/context"
import { buildFederationConfig, resolvePlatformConfig } from "../src/resolve-config"

const root = join(__dirname, "fixtures", "sample-mfe")

afterAll(() => {
  rmSync(join(root, ".platform", "manifest.json"), { force: true })
})

describe("generateManifest", () => {
  it("builds a valid production manifest from the fixture project", async () => {
    const generated = await generateManifest({ root, mode: "build", cssAssets: ["assets/style-abc.css"], builtAt: "2026-01-01T00:00:00.000Z", buildId: "build-1", persistIdentity: false })
    const { manifest } = generated
    expect(validateManifest(manifest).ok).toBe(true)
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      protocolVersion: "1.0",
      mfeId: "sample-mfe",
      kind: "mfe",
      version: "1.2.3",
      displayName: "Sample",
      description: "Sample remote used by the @platform/vite tests.",
      release: { version: "1.2.3", buildId: "build-1", builtAt: "2026-01-01T00:00:00.000Z" },
      entry: { loader: "module-federation", name: "mfe_sample_mfe", file: "remoteEntry.js", expose: "./mfe", type: "module", loaderManifest: "mf-manifest.json" },
      remote: { baseUrl: "./", preload: "none" },
      routePrefix: "/sample",
      navigation: { title: "Sample", description: "Sample remote", icon: "box", order: 5 },
      discoverable: true,
      enabled: true,
      loadPolicy: "lazy",
      permissionGroups: ["sample:read", "sample:admin"],
      capabilities: ["commands", "context", "navigation", "notifications", "overlays", "settings", "storage.session", "telemetry"],
      commands: [
        { id: "open-home", label: "Open home", group: "Sample", route: "/", keywords: ["home"], static: false },
        { id: "refresh", label: "Refresh", shortcut: "mod+r", static: false },
      ],
      settings: [{ key: "general", title: "General", managedBy: "framework", fields: [{ key: "compact", label: "Compact mode", kind: "boolean" }, { key: "pageSize", label: "Page size", kind: "number" }] }],
      help: [],
      releaseNotes: [],
      widgets: [],
      breadcrumbs: { renderer: "shell" },
      runtime: { react: { requiredVersion: "^19.0.0", major: 19 }, reactDom: { requiredVersion: "^19.0.0", major: 19 } },
      tecton: { enabled: false, foundation: "shell" },
      css: { ownerAttribute: "data-mfe", scoped: true, assets: ["assets/style-abc.css"] },
      env: { keys: { API_BASE_URL: { required: true, description: "Backend base URL", public: true }, FEATURE_X: { required: false, default: false, public: true } } },
    })
    expect(manifest.routes.map((route) => route.fullPath)).toEqual(["/sample", "/sample/assets/$assetId", "/sample/settings"])
    expect(manifest.routes.find((route) => route.path === "/settings")).toMatchObject({ guarded: true, permissionGroups: ["sample:admin"] })
    expect(manifest.shared.map((request) => request.name)).toEqual(["@tanstack/react-router", "react", "react-dom"])
    expect(manifest.shared.every((request) => request.shared && request.scope === "react19")).toBe(true)
    expect(manifest.dev).toBeUndefined()
    expect(manifest.tecton.cssProtocol).toBeUndefined()
    expect(generated.warnings).toEqual([])
    expect(typeof manifest.release.commit === "string" || manifest.release.commit === undefined).toBe(true)
  })

  it("adds the dev block in dev mode and derives the remote base URL from the origin", async () => {
    const generated = await generateManifest({ root, mode: "dev", persistIdentity: false, dev: { origin: "http://localhost:4201", configHash: "abc", restartRequired: true, restartReason: "package.json changed" } })
    expect(generated.manifest.dev).toEqual({ hmr: true, origin: "http://localhost:4201", refreshPreamble: "/@platform/refresh-preamble", configHash: "abc", restartRequired: true, restartReason: "package.json changed" })
    expect(generated.manifest.remote.baseUrl).toBe("http://localhost:4201/")
    expect(generated.manifest.release.buildId).toMatch(/^[0-9a-f]{12}$/)
    expect(generated.manifest.css.assets).toEqual([])
  })

  it("honours plugin options for the manifest and reports widget libraries", async () => {
    const generated = await generateManifest({ root, mode: "build", persistIdentity: false, options: { discoverable: false, displayName: "Renamed", capabilities: { remove: ["notifications", "settings"] }, tecton: true, css: { scope: false, foundation: "bundled" }, routesDirectory: "src/nowhere" } })
    expect(generated.manifest).toMatchObject({ displayName: "Renamed", discoverable: false, routes: [], tecton: { enabled: true, cssProtocol: "1", foundation: "bundled" }, css: { scoped: false } })
    expect(generated.manifest.capabilities).not.toContain("settings")
    expect(generated.manifest.kind).toBe("mfe")
    expect(generated.manifest.routePrefix).toBe("/sample")
    expect(generated.warnings.some((warning) => warning.includes("@tecton/react"))).toBe(true)
  })

  it("fails with MANIFEST_INVALID when inferred data does not validate", async () => {
    await expect(generateManifest({ root, mode: "build", persistIdentity: false, options: { navigation: { title: "" } as never, permissionGroups: [1 as unknown as string] } })).rejects.toMatchObject({ code: "MANIFEST_INVALID" })
  })

  it("writes the .platform/manifest.json copy", async () => {
    const generated = await generateManifest({ root, mode: "build", persistIdentity: false })
    const file = writeManifestCopy(generated.config, generated.manifest)
    expect(file).toBe(join(root, ".platform", "manifest.json"))
    expect(JSON.parse(readFileSync(file, "utf8")).mfeId).toBe("sample-mfe")
    expect(existsSync(join(root, ".platform", ".gitignore"))).toBe(true)
  })
})

describe("generated entry and config hash", () => {
  it("renders the generated entry with and without Tecton", async () => {
    const plain = await resolvePlatformConfig({ root, persistIdentity: false })
    expect(renderEntry(plain)).toBe('// Generated by @platform/vite — do not edit. Inspect freely.\nimport definition from "../src/mfe"\n\nexport default definition\n')
    const tecton = await resolvePlatformConfig({ root, persistIdentity: false, options: { tecton: true } })
    expect(renderEntry(tecton)).toBe('// Generated by @platform/vite — do not edit. Inspect freely.\nimport definition from "../src/mfe"\nimport { withTecton } from "@platform/react/tecton"\n\nexport default withTecton(definition)\n')
  })

  it("is stable for the same inputs and changes with manifest-affecting options", async () => {
    const a = await resolvePlatformConfig({ root, persistIdentity: false })
    const b = await resolvePlatformConfig({ root, persistIdentity: false })
    const c = await resolvePlatformConfig({ root, persistIdentity: false, options: { shared: { react: { singleton: true } } } })
    expect(computeConfigHash(a, buildFederationConfig(a))).toBe(computeConfigHash(b, buildFederationConfig(b)))
    expect(computeConfigHash(a, buildFederationConfig(a))).not.toBe(computeConfigHash(c, buildFederationConfig(c)))
    const fingerprint = configFingerprint(a, buildFederationConfig(a))
    expect(fingerprint).not.toHaveProperty("root")
    expect(JSON.stringify(fingerprint)).not.toContain(root)
  })
})
