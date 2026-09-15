import { describe, expect, it } from "vitest"
import { createMemoryStorageBackend, parseRuntimeConfig } from "@platform-internal/core"
import { createDiagnosticsBus } from "@platform-internal/diagnostics"

import { assertOriginAllowed, createOverrideStore, fetchManifest, MANIFEST_OVERRIDES_KEY, resolveManifestUrl } from "../src/manifests"
import { fakeFetch, manifest, ORIGIN } from "./fixtures"

describe("manifest URL precedence", () => {
  it("query > local override > runtime config > registry > default", () => {
    const storage = createMemoryStorageBackend()
    const registry = { mfeId: "asset-tracker", manifestUrl: "/registry/m.json" }
    const runtimeConfig = parseRuntimeConfig({ mfes: { "asset-tracker": { manifestUrl: "/config/m.json" } } })
    const base = { mfeId: "asset-tracker", runtimeConfig, registry }
    const noQuery = createOverrideStore({ storage, search: "" })
    expect(resolveManifestUrl({ ...base, overrides: noQuery })).toEqual({ url: "/config/m.json", source: "runtime-config" })
    noQuery.setLocal("asset-tracker", "http://localhost:5173/platform-manifest.json")
    expect(JSON.parse(storage.get("local", MANIFEST_OVERRIDES_KEY)!)).toEqual({ "asset-tracker": "http://localhost:5173/platform-manifest.json" })
    expect(resolveManifestUrl({ ...base, overrides: noQuery })).toEqual({ url: "http://localhost:5173/platform-manifest.json", source: "override" })
    const withQuery = createOverrideStore({ storage, search: "?platform.override.asset-tracker=http%3A%2F%2Flocalhost%3A4444%2Fm.json&other=1" })
    expect(resolveManifestUrl({ ...base, overrides: withQuery })).toEqual({ url: "http://localhost:4444/m.json", source: "query" })
    // The query override is persisted to session storage so it survives in-app navigation.
    expect(JSON.parse(storage.get("session", MANIFEST_OVERRIDES_KEY)!)).toEqual({ "asset-tracker": "http://localhost:4444/m.json" })
    noQuery.setLocal("asset-tracker", null)
    expect(storage.get("local", MANIFEST_OVERRIDES_KEY)).toBeNull()
    expect(resolveManifestUrl({ ...base, overrides: noQuery, runtimeConfig: parseRuntimeConfig({}) })).toEqual({ url: "/registry/m.json", source: "registry" })
    expect(resolveManifestUrl({ ...base, overrides: noQuery, runtimeConfig: parseRuntimeConfig({}), registry: undefined })).toEqual({ url: "/mfes/asset-tracker/platform-manifest.json", source: "default" })
  })
})

describe("origin validation", () => {
  const base = { mfeId: "asset-tracker", origin: ORIGIN, kind: "manifest" as const }
  it("allows same-origin, runtime config, per-MFE, registry and policy origins", () => {
    expect(assertOriginAllowed({ ...base, url: `${ORIGIN}/m.json`, runtimeConfig: parseRuntimeConfig({}) })).toBe(ORIGIN)
    expect(assertOriginAllowed({ ...base, url: "/relative.json", runtimeConfig: parseRuntimeConfig({}) })).toBe(ORIGIN)
    expect(assertOriginAllowed({ ...base, url: "https://cdn.example.com/m.json", runtimeConfig: parseRuntimeConfig({ allowedOrigins: ["https://cdn.example.com"] }) })).toBe("https://cdn.example.com")
    expect(assertOriginAllowed({ ...base, url: "https://cdn2.example.com/m.json", runtimeConfig: parseRuntimeConfig({ mfes: { "asset-tracker": { allowedOrigins: ["https://cdn2.example.com"] } } }) })).toBe("https://cdn2.example.com")
    expect(assertOriginAllowed({ ...base, url: "https://reg.example.com/m.json", runtimeConfig: parseRuntimeConfig({}), registry: { mfeId: "asset-tracker", manifestUrl: "https://reg.example.com/x.json" } })).toBe("https://reg.example.com")
    expect(assertOriginAllowed({ ...base, url: "http://localhost:5173/m.json", runtimeConfig: parseRuntimeConfig({}), policyOrigins: ["http://localhost:5173"] })).toBe("http://localhost:5173")
  })
  it("denies everything else with MANIFEST_ORIGIN_DENIED", () => {
    expect(() => assertOriginAllowed({ ...base, url: "https://evil.example.com/m.json", runtimeConfig: parseRuntimeConfig({ allowedOrigins: ["https://cdn.example.com"] }) })).toThrowError(expect.objectContaining({ code: "MANIFEST_ORIGIN_DENIED" }))
    expect(() => assertOriginAllowed({ ...base, url: "not a url ::", runtimeConfig: parseRuntimeConfig({}) })).toThrowError(expect.objectContaining({ code: "MANIFEST_ORIGIN_DENIED" }))
  })
})

describe("fetchManifest", () => {
  const url = `${ORIGIN}/m.json`
  it("retries with backoff and cache-busts retries", async () => {
    const fetch = fakeFetch({ [url]: manifest() }, { failures: { [url]: 2 } })
    const diagnostics = createDiagnosticsBus()
    const delays: number[] = []
    const result = await fetchManifest({ url, mfeId: "asset-tracker", fetch, attempts: 2, backoffMs: 100, bustOnRetry: true, noStore: false, diagnostics, sleep: async (ms) => void delays.push(ms), now: () => 777 })
    expect(result.manifest.mfeId).toBe("asset-tracker")
    expect(result.attempts).toBe(3)
    expect(fetch.calls.map((call) => call.url)).toEqual([url, `${url}?t=777`, `${url}?t=777`])
    expect(fetch.calls.map((call) => call.init?.cache)).toEqual(["default", "no-store", "no-store"])
    expect(delays).toEqual([100, 200])
    expect(diagnostics.list({ type: "manifest.retry" })).toHaveLength(2)
    expect(diagnostics.list({ type: "manifest.failed" })).toHaveLength(2)
  })
  it("uses no-store when asked and fails with MANIFEST_FETCH_FAILED after the attempts", async () => {
    const fetch = fakeFetch({ [url]: manifest() }, { failures: { [url]: 5 } })
    await expect(fetchManifest({ url, mfeId: "asset-tracker", fetch, attempts: 1, backoffMs: 0, bustOnRetry: false, noStore: true, sleep: async () => {} })).rejects.toMatchObject({ code: "MANIFEST_FETCH_FAILED" })
    expect(fetch.calls).toHaveLength(2)
    expect(fetch.calls[0]?.init?.cache).toBe("no-store")
    expect(fetch.calls[1]?.url).toBe(url)
  })
  it("does not retry invalid manifests (MANIFEST_INVALID) or mismatched ids", async () => {
    const fetch = fakeFetch({ [url]: { mfeId: "Bad Id" } })
    await expect(fetchManifest({ url, mfeId: "asset-tracker", fetch, attempts: 3, backoffMs: 0, bustOnRetry: true, noStore: false, sleep: async () => {} })).rejects.toMatchObject({ code: "MANIFEST_INVALID" })
    expect(fetch.calls).toHaveLength(1)
    const other = fakeFetch({ [url]: manifest({ mfeId: "other" }) })
    await expect(fetchManifest({ url, mfeId: "asset-tracker", fetch: other, attempts: 0, backoffMs: 0, bustOnRetry: true, noStore: false })).rejects.toMatchObject({ code: "MANIFEST_INVALID" })
    const missing = fakeFetch({})
    await expect(fetchManifest({ url, mfeId: "asset-tracker", fetch: missing, attempts: 0, backoffMs: 0, bustOnRetry: true, noStore: false })).rejects.toMatchObject({ code: "MANIFEST_FETCH_FAILED", details: { status: 404 } })
  })
})
