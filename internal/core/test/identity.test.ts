import { describe, expect, it } from "vitest"

import {
  assertRoutePrefix,
  federationName,
  inferMfeId,
  inferRoutePrefix,
  isValidMfeId,
  namespaceKey,
  parseNamespacedKey,
  qualifyId,
} from "../src/identity"

describe("identity", () => {
  it("infers mfeId from package names", () => {
    expect(inferMfeId("@acme/asset-tracker")).toBe("asset-tracker")
    expect(inferMfeId("Legacy_Reports")).toBe("legacy-reports")
    expect(inferMfeId("@x/1abc")).toBe("mfe-1abc")
  })
  it("validates ids and prefixes", () => {
    expect(isValidMfeId("asset-tracker")).toBe(true)
    expect(isValidMfeId("Asset")).toBe(false)
    expect(inferRoutePrefix("asset-tracker")).toBe("/asset-tracker")
    expect(assertRoutePrefix("/legacy/reports")).toBe("/legacy/reports")
    expect(() => assertRoutePrefix("legacy")).toThrowError(/route prefix/)
    expect(() => assertRoutePrefix("/legacy/")).toThrowError(/route prefix/)
    expect(federationName("asset-tracker")).toBe("mfe_asset_tracker")
  })
  it("namespaces keys and ids", () => {
    const key = namespaceKey({ mfeId: "asset-tracker", key: "local:dashboard" })
    expect(key).toBe("platform:asset-tracker:local:dashboard")
    expect(parseNamespacedKey(key)).toEqual({
      mfeId: "asset-tracker",
      instanceId: "local",
      key: "dashboard",
    })
    expect(qualifyId("asset-tracker", "open", "asset-tracker#1")).toBe(
      "asset-tracker:open@asset-tracker#1"
    )
  })
})
