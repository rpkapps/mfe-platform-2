import { describe, expect, it } from "vitest"
import { parseRuntimeConfig } from "@platform-internal/core"
import { createDiagnosticsBus } from "@platform-internal/diagnostics"

import {
  diffRuntimeConfig,
  loadRuntimeConfig,
  readInlineRuntimeConfig,
} from "../src/runtime-config"
import { fakeFetch } from "./fixtures"

describe("loadRuntimeConfig", () => {
  it("prefers the inline document over fetching", async () => {
    const fetch = fakeFetch({ "/platform-config.json": { environment: "fetched" } })
    const config = await loadRuntimeConfig({ inline: { environment: "inline" }, fetch })
    expect(config.environment).toBe("inline")
    expect(config.source).toBe("inline")
    expect(fetch).not.toHaveBeenCalled()
  })

  it("reads the SSR script tag, then the global", async () => {
    const script = document.createElement("script")
    script.id = "platform-config"
    script.type = "application/json"
    script.textContent = JSON.stringify({ environment: "ssr" })
    document.head.append(script)
    try {
      expect(readInlineRuntimeConfig()?.source).toBe("inline-script")
      const config = await loadRuntimeConfig({ fetch: fakeFetch({}) })
      expect(config.environment).toBe("ssr")
      expect(config.source).toBe("inline-script")
    } finally {
      script.remove()
    }
    const win = window as Window & { __PLATFORM_CONFIG__?: unknown }
    win.__PLATFORM_CONFIG__ = { environment: "global" }
    try {
      expect((await loadRuntimeConfig({ fetch: fakeFetch({}) })).source).toBe("inline-global")
    } finally {
      delete win.__PLATFORM_CONFIG__
    }
  })

  it("fetches same-origin with no-store and tolerates 404 with a diagnostic", async () => {
    const fetch = fakeFetch({
      "/platform-config.json": {
        environment: "staging",
        mfes: { "asset-tracker": { enabled: false } },
      },
    })
    const config = await loadRuntimeConfig({ fetch })
    expect(config.environment).toBe("staging")
    expect(config.source).toBe("fetch")
    expect(fetch.calls[0]?.init?.cache).toBe("no-store")
    const diagnostics = createDiagnosticsBus()
    const missing = await loadRuntimeConfig({
      fetch: fakeFetch({}),
      diagnostics,
      fallback: { environment: "fallback" },
    })
    expect(missing.environment).toBe("fallback")
    expect(missing.source).toBe("fallback")
    expect(diagnostics.list({ level: "warn" })).toHaveLength(1)
    expect(diagnostics.list({ type: "runtime-config.loaded" })[0]).toMatchObject({
      source: "fallback",
    })
  })

  it("rejects invalid documents and failed fetches with platform errors", async () => {
    await expect(loadRuntimeConfig({ inline: { environment: 42 } })).rejects.toMatchObject({
      code: "RUNTIME_CONFIG_INVALID",
    })
    await expect(
      loadRuntimeConfig({
        fetch: fakeFetch(
          { "/platform-config.json": "boom" },
          { status: { "/platform-config.json": 500 } }
        ),
      })
    ).rejects.toMatchObject({ code: "RUNTIME_CONFIG_FETCH_FAILED" })
    await expect(
      loadRuntimeConfig({
        fetch: fakeFetch(
          { "/platform-config.json": {} },
          { failures: { "/platform-config.json": 1 } }
        ),
      })
    ).rejects.toMatchObject({ code: "RUNTIME_CONFIG_FETCH_FAILED" })
  })

  it("diffs enable/disable and manifest URL changes per MFE", () => {
    const a = parseRuntimeConfig({
      mfes: { x: { enabled: true, manifestUrl: "/a.json", env: { K: 1 } }, y: {} },
    })
    const b = parseRuntimeConfig({
      mfes: { x: { enabled: false, manifestUrl: "/b.json", env: { K: 1 } }, z: {} },
    })
    expect(diffRuntimeConfig(a, b).sort()).toEqual([
      "mfes.x.enabled",
      "mfes.x.manifestUrl",
      "mfes.y",
      "mfes.z",
    ])
    expect(diffRuntimeConfig(a, a)).toEqual([])
  })
})
