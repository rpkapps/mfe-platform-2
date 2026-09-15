import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { buildFederationConfig, resolvePlatformConfig } from "../src/resolve-config"

const sample = join(__dirname, "fixtures", "sample-mfe")
const dirs: string[] = []

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "platform-vite-config-"))
  dirs.push(root)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true })
    writeFileSync(join(root, name), content)
  }
  return root
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("resolvePlatformConfig", () => {
  it("applies plugin option > mfe.config > inference > default per key", async () => {
    const root = project({
      "package.json": JSON.stringify({ name: "@acme/Inferred Id", version: "2.0.0", description: "pkg description", dependencies: { react: "^18.3.0", "react-dom": "^18.3.0", "@tecton/react": "github:acme/tecton" } }),
      "mfe.config.ts": `import { defineMfeConfig } from ${JSON.stringify(join(__dirname, "..", "src", "config.ts"))}
export default defineMfeConfig({ routePrefix: "/from-config", description: "config description", discoverable: false, permissionGroups: ["a"], capabilities: { add: ["widgets"] }, css: { foundation: "bundled" }, env: { A: { required: true } } })`,
      "src/mfe.tsx": "export default {}",
    })
    const config = await resolvePlatformConfig({ root, options: { routePrefix: "/from-option", permissionGroups: ["b"], capabilities: { remove: ["telemetry"] }, css: { ownerAttribute: "data-owner" }, env: { B: {} } } })
    expect(config.mfeId).toBe("inferred-id")
    expect(config.mfeIdSource).toBe("inferred")
    expect(config.federationName).toBe("mfe_inferred_id")
    expect(config.routePrefix).toBe("/from-option")
    expect(config.description).toBe("config description")
    expect(config.discoverable).toBe(false)
    expect(config.displayName).toBe("inferred-id")
    expect(config.permissionGroups).toEqual(["a", "b"])
    expect(config.capabilities).toEqual({ add: ["widgets"], remove: ["telemetry"] })
    expect(config.css).toEqual({ scope: true, ownerAttribute: "data-owner", foundation: "bundled" })
    expect(config.env).toEqual({ A: { required: true }, B: {} })
    expect(config.tecton).toBe(true)
    expect(config.tailwind).toBe(false)
    expect(config.configFile).toBe(join(root, "mfe.config.ts"))
    expect(config.runtime.react).toEqual({ requiredVersion: "^18.3.0", major: 18, builtWith: undefined })
    expect(config.shared.reactMajor).toBe(18)
    expect(config.shared.requests.find((request) => request.name === "react")).toMatchObject({ scope: "react18", shared: true, requiredVersion: "^18.3.0" })
    expect(config.shared.requests.find((request) => request.name === "@tecton/react")).toMatchObject({ shared: false, reason: "source-package" })
    // Second run: identity persisted, package rename ignored.
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "renamed", version: "2.0.0" }))
    const again = await resolvePlatformConfig({ root })
    expect(again).toMatchObject({ mfeId: "inferred-id", mfeIdSource: "identity", routePrefix: "/from-config", tecton: false })
    expect(again.warnings.some((warning) => warning.includes("react is not a dependency"))).toBe(true)
  })

  it("falls back to defaults without mfe.config and supports .mjs configs", async () => {
    const root = project({ "package.json": JSON.stringify({ name: "plain-mfe" }), "mfe.config.mjs": "export default { navigation: { title: \"Plain\" } }" })
    const config = await resolvePlatformConfig({ root })
    expect(config.routePrefix).toBe("/plain-mfe")
    expect(config.displayName).toBe("Plain")
    expect(config.discoverable).toBe(true)
    expect(config.css).toEqual({ scope: true, ownerAttribute: "data-mfe", foundation: "shell" })
    expect(config.routesDirectory).toBe(join(root, "src/routes"))
    expect(config.entry).toBe(join(root, "src/mfe.tsx"))
    expect(config.generatedEntry).toBe(join(root, ".platform/entry.tsx"))
    expect(config.manifestFileName).toBe("platform-manifest.json")
    expect(config.harness).toEqual({ enabled: true, dir: undefined })
  })

  it("fails on invalid ids and prefixes with PlatformErrors", async () => {
    const root = project({ "package.json": JSON.stringify({ name: "x" }), "mfe.config.ts": "export default { routePrefix: \"bad/\" }" })
    await expect(resolvePlatformConfig({ root })).rejects.toMatchObject({ code: "ROUTE_PREFIX_INVALID" })
    await expect(resolvePlatformConfig({ root, options: { mfeId: "Bad Id" } })).rejects.toMatchObject({ code: "MFE_ID_INVALID" })
    const broken = project({ "package.json": JSON.stringify({ name: "x" }), "mfe.config.ts": "export default 42" })
    await expect(resolvePlatformConfig({ root: broken })).rejects.toMatchObject({ code: "INTERNAL" })
  })

  it("resolves the sample fixture with installed versions and builds the federation config", async () => {
    const config = await resolvePlatformConfig({ root: sample, persistIdentity: false })
    expect(config.mfeId).toBe("sample-mfe")
    expect(config.mfeIdSource).toBe("identity")
    expect(config.routePrefix).toBe("/sample")
    expect(config.tailwind).toBe(true)
    expect(config.tecton).toBe(false)
    expect(config.installed.react).toMatch(/^19\./)
    const react = config.shared.requests.find((request) => request.name === "react")
    expect(react).toMatchObject({ scope: "react19", shared: true, singleton: false, requiredVersion: "^19.0.0", pairedWith: ["react-dom"] })
    expect(react?.version).toBe(config.installed.react)
    expect(config.runtime.react).toEqual({ requiredVersion: "^19.0.0", major: 19, builtWith: config.installed.react })
    expect(config.runtime.tanstackRouter?.builtWith).toBe(config.installed["@tanstack/react-router"])
    const federation = buildFederationConfig(config)
    expect(federation).toMatchObject({ name: "mfe_sample_mfe", filename: "remoteEntry.js", exposes: { "./mfe": join(sample, ".platform/entry.tsx") }, manifest: true, dts: false })
    expect(federation.shared).toMatchObject({ react: { shareScope: "react19", requiredVersion: "^19.0.0", singleton: false }, "react-dom": { shareScope: "react19" }, "@tanstack/react-router": { shareScope: "react19" } })
    expect(federation.shared).not.toHaveProperty("zod")
    const custom = await resolvePlatformConfig({ root: sample, persistIdentity: false, options: { federation: (base) => ({ ...base, shared: {} }) } })
    expect(buildFederationConfig(custom).shared).toEqual({})
  })
})
