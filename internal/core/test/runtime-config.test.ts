import { describe, expect, it } from "vitest"

import { generateRuntimeConfig, parseRuntimeConfig, redactRuntimeConfig, runtimeViewFor } from "../src/runtime-config"

describe("runtime config", () => {
  it("generates from PLATFORM_* variables, refuses secrets, tracks sources", () => {
    const { config, refused, sources } = generateRuntimeConfig({
      env: {
        PLATFORM_ENVIRONMENT: "staging",
        PLATFORM_RELEASE_VERSION: "2.1.0",
        PLATFORM_SHARED_SUPPORT_URL: "https://support",
        PLATFORM_MFE_ASSET_TRACKER_MANIFEST_URL: "https://cdn/asset-tracker/platform-manifest.json",
        PLATFORM_MFE_ASSET_TRACKER_ENABLED: "true",
        PLATFORM_MFE_ASSET_TRACKER_ENV_API_BASE_URL: "https://api",
        PLATFORM_MFE_ASSET_TRACKER_ENV_PAGE_SIZE: "50",
        PLATFORM_MFE_LEGACY_REPORTS_ENABLED: "false",
        PLATFORM_MFE_ASSET_TRACKER_ENV_API_TOKEN: "secret",
        PLATFORM_DB_PASSWORD: "nope",
        DATABASE_URL: "postgres://",
        PLATFORM_ALLOWED_ORIGINS: "https://cdn, https://other",
      },
      knownMfeIds: ["asset-tracker", "legacy-reports"],
      now: () => new Date("2026-01-01T00:00:00Z"),
    })
    expect(config.environment).toBe("staging")
    expect(config.release.version).toBe("2.1.0")
    expect(config.shared.SUPPORT_URL).toBe("https://support")
    expect(config.mfes["asset-tracker"]).toMatchObject({ enabled: true, manifestUrl: "https://cdn/asset-tracker/platform-manifest.json", env: { API_BASE_URL: "https://api", PAGE_SIZE: 50 } })
    expect(config.mfes["legacy-reports"]).toMatchObject({ enabled: false })
    expect(refused).toEqual(expect.arrayContaining(["PLATFORM_MFE_ASSET_TRACKER_ENV_API_TOKEN", "PLATFORM_DB_PASSWORD"]))
    expect(config.mfes["asset-tracker"]!.env.API_TOKEN).toBeUndefined()
    expect(sources["mfes.asset-tracker.manifestUrl"]).toBe("PLATFORM_MFE_ASSET_TRACKER_MANIFEST_URL")
    expect(config.allowedOrigins).toEqual(["https://cdn", "https://other"])
    expect(config.generatedAt).toBe("2026-01-01T00:00:00.000Z")
  })
  it("maps unknown ids by keyword boundary", () => {
    const { config } = generateRuntimeConfig({ env: { PLATFORM_MFE_WIDGET_A_MANIFEST_URL: "u" } })
    expect(config.mfes["widget-a"]?.manifestUrl).toBe("u")
  })
  it("validates documents with actionable errors", () => {
    expect(() => parseRuntimeConfig({ mfes: { "Bad Id": {} } }, "test")).toThrowError(/Runtime configuration is invalid: mfes/)
    expect(parseRuntimeConfig({}, "inline").source).toBe("inline")
  })
  it("gives an MFE only its allow-listed view", () => {
    const config = parseRuntimeConfig({ environment: "prod", shared: { A: 1 }, mfes: { a: { env: { X: "x", Y: "y" } }, b: { env: { Z: "z" } } } })
    const view = runtimeViewFor(config, "a", { X: {}, W: { default: "w" } })
    expect(view.env).toEqual({ X: "x", W: "w" })
    expect(view.shared).toEqual({ A: 1 })
    expect(runtimeViewFor(config, "a").env).toEqual({ X: "x", Y: "y" })
    expect(redactRuntimeConfig(parseRuntimeConfig({ shared: { SOME_TOKEN: "t" } })).shared.SOME_TOKEN).toBe("•••")
  })
})
