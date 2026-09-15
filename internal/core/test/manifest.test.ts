import { describe, expect, it } from "vitest"

import { manifestRoutePrefix, resolveRemoteUrl, validateManifest } from "../src/manifest"
import { isProtocolCompatible } from "../src/protocol"
import { PUBLISHED_SCHEMAS, toJsonSchema } from "../src/json-schema"

const minimal = {
  mfeId: "asset-tracker",
  version: "1.0.0",
  release: { version: "1.0.0" },
  entry: { loader: "module-federation", name: "mfe_asset_tracker", file: "remoteEntry.js" },
  runtime: { react: { requiredVersion: "^19.0.0", major: 19 } },
}

describe("manifest", () => {
  it("applies defaults", () => {
    const result = validateManifest(minimal)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.manifest).toMatchObject({
        schemaVersion: 1,
        protocolVersion: "1.0",
        discoverable: true,
        enabled: true,
        routes: [],
        entry: { expose: "./mfe", type: "module" },
        css: { ownerAttribute: "data-mfe", scoped: true },
      })
      expect(manifestRoutePrefix(result.manifest)).toBe("/asset-tracker")
    }
  })
  it("reports issues with paths", () => {
    const result = validateManifest({ ...minimal, mfeId: "Bad", routePrefix: "nope" })
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.issues.map((i) => i.path)).toEqual(
        expect.arrayContaining(["mfeId", "routePrefix"])
      )
  })
  it("resolves urls and protocol compatibility", () => {
    expect(resolveRemoteUrl("https://cdn/x/platform-manifest.json", "./remoteEntry.js")).toBe(
      "https://cdn/x/remoteEntry.js"
    )
    expect(isProtocolCompatible("1.0", "1.3")).toBe(true)
    expect(isProtocolCompatible("1.0", "2.0")).toBe(false)
  })
  it("publishes JSON schemas", () => {
    for (const name of Object.keys(PUBLISHED_SCHEMAS) as (keyof typeof PUBLISHED_SCHEMAS)[]) {
      const schema = toJsonSchema(name)
      expect(schema.$id).toContain(name)
      expect(schema).toHaveProperty("type")
    }
  })
})
