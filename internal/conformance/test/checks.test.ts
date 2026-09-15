import { describe, expect, it } from "vitest"

import { checkRemoteConformance } from "../src/checks"

const manifest = {
  mfeId: "asset-tracker",
  version: "1.0.0",
  release: { version: "1.0.0" },
  entry: {
    loader: "module-federation",
    name: "mfe_asset_tracker",
    file: "remoteEntry.js",
    loaderManifest: "mf-manifest.json",
  },
  runtime: { react: { requiredVersion: "^19.0.0", major: 19 } },
  routes: [{ path: "/", fullPath: "/asset-tracker", file: "index.tsx" }],
  shared: [
    { name: "react", requiredVersion: "^19.0.0", scope: "react19" },
    { name: "react-dom", requiredVersion: "^19.0.0", scope: "react19" },
  ],
}

describe("checkRemoteConformance", () => {
  it("passes a well-formed remote", () => {
    const result = checkRemoteConformance({
      manifest,
      files: ["remoteEntry.js", "mf-manifest.json"],
      css: { "a.css": '[data-mfe="asset-tracker"] .x{color:red}' },
      hostProtocolVersion: "1.0",
    })
    expect(result.ok).toBe(true)
    expect(result.findings).toEqual([])
  })
  it("reports missing entry, unscoped css, dev block and scope mismatches", () => {
    const result = checkRemoteConformance({
      manifest: {
        ...manifest,
        dev: { hmr: true },
        shared: [
          { name: "react", requiredVersion: "^19", scope: "react18" },
          { name: "react-dom", requiredVersion: "^19", scope: "react19" },
        ],
      },
      files: [],
      css: { "a.css": ":root{--x:1}" },
      hostProtocolVersion: "2.0",
    })
    expect(result.ok).toBe(false)
    expect(result.findings.map((f) => f.check)).toEqual(
      expect.arrayContaining([
        "protocol.compatible",
        "entry.present",
        "dev.absent",
        "react.pair",
        "react.scope",
        "css.scoped",
        "css.no-global",
      ])
    )
  })
})
