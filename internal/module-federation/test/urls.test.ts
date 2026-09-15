import { describe, expect, it } from "vitest"

import { computeEntryUrl, exposeId, refreshPreambleUrl, withQuery } from "../src/urls"
import { manifest } from "./fixtures"

describe("entry URLs", () => {
  it("resolves baseUrl + file against the manifest URL and cache-busts with the buildId", () => {
    const url = computeEntryUrl(manifest(), { manifestUrl: "https://cdn.example.com/mfes/asset-tracker/platform-manifest.json" })
    expect(url).toBe("https://cdn.example.com/mfes/asset-tracker/assets/remoteEntry.js?v=b42")
  })
  it("uses the dev origin for development manifests and never adds ?v=", () => {
    const url = computeEntryUrl(
      manifest({ dev: { hmr: true, origin: "http://localhost:5173", refreshPreamble: "/@platform/refresh-preamble" } }),
      { manifestUrl: "http://localhost:5173/platform-manifest.json" }
    )
    expect(url).toBe("http://localhost:5173/assets/remoteEntry.js")
  })
  it("adds ?t= on retries and keeps other params", () => {
    const url = computeEntryUrl(manifest(), { manifestUrl: "https://cdn.example.com/m.json", bustNow: 1234 })
    expect(url).toBe("https://cdn.example.com/assets/remoteEntry.js?v=b42&t=1234")
    expect(withQuery("/x/y.js?a=1", "t", "2")).toBe("/x/y.js?a=1&t=2")
    expect(withQuery("/x/y.js?t=1", "t", "2")).toBe("/x/y.js?t=2")
  })
  it("respects absolute base URLs", () => {
    const url = computeEntryUrl(manifest({ remote: { baseUrl: "https://static.example.com/at/", preload: "none" } }), { manifestUrl: "https://app.example.com/m.json", cacheBust: false })
    expect(url).toBe("https://static.example.com/at/remoteEntry.js")
  })
  it("computes expose ids and preamble URLs", () => {
    expect(exposeId(manifest())).toBe("mfe_asset_tracker/mfe")
    expect(refreshPreambleUrl(manifest(), "http://x/m.json")).toBeUndefined()
    expect(refreshPreambleUrl(manifest({ dev: { hmr: true, origin: "http://localhost:5173", refreshPreamble: "/@platform/refresh-preamble" } }), "http://x/m.json")).toBe("http://localhost:5173/@platform/refresh-preamble")
  })
})
