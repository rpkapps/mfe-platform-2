import { describe, expect, it } from "vitest"

import { inferSharedDependencies, negotiateShared, shareScopeFor } from "../src/shared-deps"

describe("shared dependency inference", () => {
  it("infers defaults, scopes React-bound packages by major and bundles source packages", () => {
    const result = inferSharedDependencies({
      dependencies: { react: "^18.3.1", "react-dom": "^18.3.1", "@tanstack/react-router": "^1.170.0", "@tanstack/history": "^1.162.0", zod: "^4.0.0", "@tecton/react": "github:x/y#abc&path:p", lodash: "^4" },
      installed: { react: "18.3.1", "react-dom": "18.3.1", "@tecton/react": "0.0.0" },
    })
    expect(result.reactMajor).toBe(18)
    const byName = Object.fromEntries(result.requests.map((r) => [r.name, r]))
    expect(byName.react).toMatchObject({ scope: "react18", shared: true, pairedWith: ["react-dom"] })
    expect(byName["@tanstack/history"]).toMatchObject({ scope: "default", shared: true })
    expect(byName["@tecton/react"]).toMatchObject({ shared: false, reason: "source-package" })
    expect(byName.lodash).toBeUndefined()
    expect(byName["@platform/react"]).toBeUndefined()
  })
  it("shares the SDK subpath entries together with the main entry", () => {
    const result = inferSharedDependencies({ dependencies: { react: "^19.0.0", "react-dom": "^19.0.0", "@platform/react": "^0.1.0" }, installed: { "@platform/react": "0.1.0" } })
    const byName = Object.fromEntries(result.requests.map((r) => [r.name, r]))
    expect(byName["@platform/react"]).toMatchObject({ scope: "react19", shared: true })
    expect(byName["@platform/react/tecton"]).toMatchObject({ scope: "react19", shared: true, requiredVersion: "^0.1.0" })
  })

  it("applies overrides: disable, pin, extra", () => {
    const result = inferSharedDependencies({ dependencies: { react: "^19.0.0", "react-dom": "^19.0.0", zod: "^4", dayjs: "^1" }, overrides: { zod: false, react: { version: "^19.1.0" }, dayjs: true } })
    const byName = Object.fromEntries(result.requests.map((r) => [r.name, r]))
    expect(byName.zod).toMatchObject({ shared: false, reason: "disabled" })
    expect(byName.react).toMatchObject({ requiredVersion: "^19.1.0", reason: "pinned" })
    expect(byName.dayjs).toMatchObject({ shared: true, reason: "configured", scope: "default" })
  })
  it("warns on mismatched react pair", () => {
    const result = inferSharedDependencies({ dependencies: { react: "^18.0.0", "react-dom": "^19.0.0" } })
    expect(result.warnings[0]).toMatch(/coordinated pair/)
  })
  it("scopes", () => {
    expect(shareScopeFor("react-dom/client", 18)).toBe("react18")
    expect(shareScopeFor("zod", 18)).toBe("default")
  })
})

describe("negotiation", () => {
  const providers = [
    { name: "react", version: "19.3.0", scope: "react19", from: "shell", loaded: true },
    { name: "react-dom", version: "19.3.0", scope: "react19", from: "shell", loaded: true },
    { name: "react", version: "18.3.1", scope: "react18", from: "legacy-reports", loaded: true },
    { name: "react-dom", version: "18.3.1", scope: "react18", from: "legacy-reports", loaded: true },
    { name: "react", version: "18.2.0", scope: "react18", from: "widget-b" },
    { name: "react-dom", version: "18.2.0", scope: "react18", from: "widget-b" },
    { name: "zod", version: "4.6.5", scope: "default", from: "shell", loaded: true },
  ]
  it("shares by version group and never lets React 19 satisfy React 18", () => {
    const resolutions = negotiateShared({ requester: "widget-b", providers, requests: [
      { name: "react", requiredVersion: "^18.2.0", version: "18.2.0", scope: "react18", singleton: false, shared: true, reason: "inferred", pairedWith: ["react-dom"] },
      { name: "react-dom", requiredVersion: "^18.2.0", version: "18.2.0", scope: "react18", singleton: false, shared: true, reason: "inferred", pairedWith: ["react"] },
    ] })
    expect(resolutions.every((r) => r.outcome === "shared" && r.provider?.from === "legacy-reports" && r.version === "18.3.1")).toBe(true)
  })
  it("bundles when nothing compatible exists and reports the reason", () => {
    const [react] = negotiateShared({ requester: "x", providers, requests: [{ name: "react", requiredVersion: "^17.0.0", version: "17.0.2", scope: "react17", singleton: false, shared: true, reason: "inferred" }] })
    expect(react).toMatchObject({ outcome: "bundled", version: "17.0.2" })
    expect(react!.reason).toMatch(/no provider in scope "react17"/)
  })
  it("bundles the pair when react and react-dom would come from different providers", () => {
    const resolutions = negotiateShared({ requester: "x", providers: [providers[0]!, { name: "react-dom", version: "19.3.0", scope: "react19", from: "other" }], requests: [
      { name: "react", requiredVersion: "^19.0.0", version: "19.3.0", scope: "react19", singleton: false, shared: true, reason: "inferred", pairedWith: ["react-dom"] },
      { name: "react-dom", requiredVersion: "^19.0.0", version: "19.3.0", scope: "react19", singleton: false, shared: true, reason: "inferred", pairedWith: ["react"] },
    ] })
    // react from shell (loaded), react-dom only from "other": different providers → bundled pair
    expect(resolutions.map((r) => r.outcome)).toEqual(["bundled", "bundled"])
  })
  it("respects disabled sharing", () => {
    const [zod] = negotiateShared({ requester: "x", providers, requests: [{ name: "zod", requiredVersion: "^4", version: "4.6.5", scope: "default", singleton: false, shared: false, reason: "disabled" }] })
    expect(zod).toMatchObject({ outcome: "bundled" })
  })
})
