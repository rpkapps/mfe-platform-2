import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { decideDevtools, loadDevtools, setDevtoolsFlag, shouldLoadDevtools } from "../src/devtools"
import { createTestHost, fakeFetch, fakeLoader } from "./fixtures"

function hostWith(policy: "flag" | "always" | "never", environment: string, environments = ["development", "local", "test", "staging"]) {
  return createTestHost({ fetch: fakeFetch({}), loader: fakeLoader({}), environment, devtools: { policy, environments } })
}

describe("shouldLoadDevtools", () => {
  it("evaluates the flag/policy/environment matrix", () => {
    window.localStorage.removeItem("platform:devtools")
    expect(decideDevtools(hostWith("flag", "test"))).toEqual({ allowed: false, reason: "flag-missing" })
    expect(decideDevtools(hostWith("never", "test"))).toEqual({ allowed: false, reason: "policy-never" })
    expect(decideDevtools(hostWith("always", "production"))).toEqual({ allowed: true, reason: "policy-always" })
    expect(decideDevtools(hostWith("flag", "production"))).toEqual({ allowed: false, reason: "environment" })
    setDevtoolsFlag(true)
    expect(window.localStorage.getItem("platform:devtools")).toBe("1")
    expect(decideDevtools(hostWith("flag", "test"))).toEqual({ allowed: true, reason: "flag" })
    expect(decideDevtools(hostWith("flag", "production"))).toEqual({ allowed: false, reason: "environment" })
    expect(decideDevtools(hostWith("flag", "production", ["production"]))).toEqual({ allowed: true, reason: "flag" })
    expect(decideDevtools(hostWith("never", "test"))).toEqual({ allowed: false, reason: "policy-never" })
    setDevtoolsFlag(false)
    expect(decideDevtools(hostWith("flag", "test"))).toEqual({ allowed: false, reason: "flag-missing" })
    expect(decideDevtools(hostWith("flag", "test"), { location: { search: "?platform.devtools=1" }, localStorage: window.localStorage } as unknown as Window)).toEqual({ allowed: true, reason: "flag" })
    expect(decideDevtools(hostWith("always", "test"), null)).toEqual({ allowed: false, reason: "no-window" })
    const host = hostWith("never", "test")
    expect(shouldLoadDevtools(host)).toBe(false)
    expect(host.diagnostics.list({ type: "devtools" })[0]).toMatchObject({ action: "denied", reason: "policy-never" })
  })

  it("loads the devtools module lazily and reports it", async () => {
    const host = hostWith("always", "test")
    const module = await loadDevtools(host)
    expect(typeof module.DevtoolsPanel).toBe("function")
    expect(typeof module.registerDevtoolsPanel).toBe("function")
    expect(host.diagnostics.list({ type: "devtools" }).some((event) => (event as { action: string }).action === "loaded")).toBe(true)
  })
})

describe("build output", () => {
  const dist = `${[resolve(process.cwd(), "dist"), resolve(process.cwd(), "packages/host/dist")].find((candidate) => existsSync(`${candidate}/index.js`)) ?? resolve(process.cwd(), "dist")}/`
  const skip = !existsSync(`${dist}index.js`)
  it.skipIf(skip)("keeps React Flow out of the main entries (only the lazy devtools chunk imports @xyflow)", () => {
    const main = readFileSync(`${dist}index.js`, "utf8")
    expect(main).not.toContain("@xyflow")
    expect(main).not.toContain("DevtoolsPanel")
    for (const entry of ["react.js", "tanstack.js", "harness.js"]) {
      if (existsSync(`${dist}${entry}`)) expect(readFileSync(`${dist}${entry}`, "utf8")).not.toContain("@xyflow")
    }
    // Chunks statically reachable from index.js never import React Flow.
    const seen = new Set<string>()
    const visit = (file: string) => {
      if (seen.has(file) || !existsSync(`${dist}${file}`)) return
      seen.add(file)
      const source = readFileSync(`${dist}${file}`, "utf8")
      expect(source, file).not.toContain("@xyflow")
      for (const match of source.matchAll(/^import[^"']*["']\.\/([^"']+)["']/gm)) visit(match[1]!)
      for (const match of source.matchAll(/^export[^"']*from\s*["']\.\/([^"']+)["']/gm)) visit(match[1]!)
    }
    visit("index.js")
    const reachable = Array.from(seen).map((file) => readFileSync(`${dist}${file}`, "utf8")).join("\n")
    expect(reachable).toMatch(/import\(["']\.\/devtools-entry[^"']*["']\)/)
  })
  it.skipIf(skip)("ships the entrypoint with a node shebang and the stylesheet", () => {
    expect(readFileSync(`${dist}entrypoint.js`, "utf8").startsWith("#!/usr/bin/env node")).toBe(true)
    expect(existsSync(`${dist}styles.css`)).toBe(true)
  })
})
