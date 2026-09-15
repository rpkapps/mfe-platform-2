import { describe, expect, it } from "vitest"

import { applySharePolicy, hostShareScope, providersFrom, type ResolveShareArgs, type SharePolicyState } from "../src/share-policy"

const entry = (version: string, from: string, loaded = true) => ({ version, from, loaded })

function args(state: Partial<ResolveShareArgs> & Pick<ResolveShareArgs, "pkgName" | "scope">): ResolveShareArgs {
  return {
    shareScopeMap: {},
    version: "0.0.0",
    shareInfo: { version: "0.0.0", from: "mfe_a", shareConfig: { requiredVersion: "*", singleton: true } },
    resolver: () => undefined,
    ...state,
  }
}

describe("share policy", () => {
  it("prefers loaded providers in the same scope and never crosses scopes", () => {
    const state: SharePolicyState = { resolutions: new Map() }
    const map = {
      react19: { react: { "19.3.0": entry("19.3.0", "shell"), "19.4.0": entry("19.4.0", "mfe_b", false) } },
      react18: { react: { "18.3.1": entry("18.3.1", "mfe_c") } },
    }
    const shared = applySharePolicy(state, args({ shareScopeMap: map, scope: "react19", pkgName: "react", version: "19.1.0", shareInfo: { version: "19.1.0", from: "mfe_a", shareConfig: { requiredVersion: "^19.0.0", singleton: true } } }))
    expect(shared.resolver()?.shared).toBe(map.react19.react["19.3.0"])
    expect(state.resolutions.get("mfe_a")?.get("react")).toMatchObject({ outcome: "shared", version: "19.3.0", provider: { from: "shell" } })

    const bundled = applySharePolicy(state, args({ shareScopeMap: map, scope: "react18", pkgName: "react", version: "18.2.0", shareInfo: { version: "18.2.0", from: "mfe_d", shareConfig: { requiredVersion: "^18.0.0", singleton: true } } }))
    // mfe_c provides 18.3.1 in react18 → shared from mfe_c, never from the React 19 shell.
    expect(bundled.resolver()?.shared).toBe(map.react18.react["18.3.1"])
    expect(state.resolutions.get("mfe_d")?.get("react")).toMatchObject({ outcome: "shared", provider: { from: "mfe_c" } })

    const none = applySharePolicy(state, args({ shareScopeMap: { react19: map.react19 }, scope: "react18", pkgName: "react", version: "18.2.0", shareInfo: { version: "18.2.0", from: "mfe_e", shareConfig: { requiredVersion: "^18.0.0", singleton: true } } }))
    expect(none.resolver()).toBeUndefined()
    expect(state.resolutions.get("mfe_e")?.get("react")).toMatchObject({ outcome: "bundled", reason: expect.stringContaining("no provider") })
  })

  it("coordinates react and react-dom from one provider", () => {
    const state: SharePolicyState = { resolutions: new Map() }
    const map = {
      react19: {
        react: { "19.3.0": entry("19.3.0", "shell") },
        "react-dom": { "19.3.0": entry("19.3.0", "mfe_b") },
      },
    }
    applySharePolicy(state, args({ shareScopeMap: map, scope: "react19", pkgName: "react", version: "19.3.0", shareInfo: { version: "19.3.0", from: "mfe_a", shareConfig: { requiredVersion: "^19.0.0", singleton: true } } }))
    const dom = applySharePolicy(state, args({ shareScopeMap: map, scope: "react19", pkgName: "react-dom", version: "19.3.0", shareInfo: { version: "19.3.0", from: "mfe_a", shareConfig: { requiredVersion: "^19.0.0", singleton: true } } }))
    expect(dom.resolver()).toBeUndefined()
    expect(state.resolutions.get("mfe_a")?.get("react-dom")).toMatchObject({ outcome: "bundled", reason: expect.stringContaining("one provider") })
  })

  it("lists providers defensively and computes host scopes", () => {
    expect(providersFrom(undefined)).toEqual([])
    expect(providersFrom({ default: { zod: { "4.0.0": entry("4.0.0", "shell") }, broken: null as never } })).toEqual([{ name: "zod", version: "4.0.0", scope: "default", from: "shell", loaded: true }])
    expect(hostShareScope("react", "19.3.0")).toBe("react19")
    expect(hostShareScope("react-dom", "18.3.1")).toBe("react18")
    expect(hostShareScope("zod", "4.0.0")).toBe("default")
  })
})
