import { describe, expect, it, vi } from "vitest"
import { PlatformError, type DiagnosticEvent, type DiagnosticInput, type DiagnosticSink } from "@platform-internal/core"

import type { FederationInstance, FederationInstanceOptions } from "../src/federation"
import { createModuleFederationLoader } from "../src/loader"
import { definition, manifest } from "./fixtures"

function recordingSink(): DiagnosticSink & { list(filter?: { type?: string; level?: string }): DiagnosticEvent[] } {
  const events: DiagnosticEvent[] = []
  return {
    emit(input: DiagnosticInput) {
      events.push({ id: events.length + 1, at: 0, level: input.level ?? "info", ...input } as DiagnosticEvent)
    },
    list: (filter = {}) => events.filter((event) => (!filter.type || event.type === filter.type) && (!filter.level || event.level === filter.level)),
  }
}

function fakeInstance(loadRemote: (id: string) => Promise<unknown>, extra: Partial<FederationInstance> = {}) {
  const registered: { remotes: unknown[]; options: unknown }[] = []
  let options: FederationInstanceOptions | undefined
  const instance: FederationInstance = {
    name: "shell",
    registerRemotes: (remotes, opts) => {
      registered.push({ remotes, options: opts })
    },
    loadRemote: loadRemote as FederationInstance["loadRemote"],
    shareScopeMap: {},
    ...extra,
  }
  return {
    registered,
    get options() {
      return options
    },
    createInstance: (opts: FederationInstanceOptions) => {
      options = opts
      return instance
    },
  }
}

describe("module federation loader", () => {
  it("registers remotes from the manifest with alias, type and share scopes", async () => {
    const fake = fakeInstance(async () => ({ default: definition() }))
    const loader = createModuleFederationLoader({
      createInstance: fake.createInstance,
      shared: { react: { version: "19.3.0", lib: () => ({}) }, zod: { version: "4.6.5", lib: () => ({}) } },
    })
    await loader.register(manifest(), { manifestUrl: "https://cdn.example.com/m.json" })
    expect(fake.registered[0]).toEqual({
      remotes: [
        {
          name: "mfe_asset_tracker",
          entry: "https://cdn.example.com/assets/remoteEntry.js?v=b42",
          alias: "asset-tracker",
          type: "module",
          shareScope: ["default", "react19"],
        },
      ],
      options: { force: true },
    })
    expect(fake.options?.shared.react?.scope).toEqual(["react19"])
    expect(fake.options?.shared.zod?.scope).toEqual(["default"])
    expect(fake.options?.shared.react?.shareConfig).toEqual({ singleton: true, requiredVersion: "^19.3.0", eager: undefined })
  })

  it("loads the definition, retries with backoff and cache-busts between attempts", async () => {
    let calls = 0
    const fake = fakeInstance(async () => {
      calls += 1
      if (calls < 3) throw new Error(`network ${calls}`)
      return { default: definition() }
    })
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})
    const diagnostics = recordingSink()
    let clock = 1000
    const loader = createModuleFederationLoader({ createInstance: fake.createInstance, retry: { attempts: 2, backoffMs: 100 }, sleep, now: () => (clock += 1), diagnostics })
    const result = await loader.load(manifest(), { manifestUrl: "https://cdn.example.com/m.json" })
    expect(result.mfeId).toBe("asset-tracker")
    expect(calls).toBe(3)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200])
    const entries = fake.registered.map((r) => (r.remotes[0] as { entry: string }).entry)
    expect(entries[0]).toBe("https://cdn.example.com/assets/remoteEntry.js?v=b42")
    expect(entries[1]).toMatch(/\?v=b42&t=\d+$/)
    expect(entries[2]).toMatch(/\?v=b42&t=\d+$/)
    expect(entries[1]).not.toBe(entries[2])
    expect(diagnostics.list({ type: "remote.failed" })).toHaveLength(2)
    expect(diagnostics.list({ type: "remote.loaded" })).toHaveLength(1)
  })

  it("gives up after the configured attempts with REMOTE_LOAD_FAILED", async () => {
    const fake = fakeInstance(async () => {
      throw new Error("offline")
    })
    const loader = createModuleFederationLoader({ createInstance: fake.createInstance, retry: { attempts: 1, backoffMs: 0 }, sleep: async () => {} })
    await expect(loader.load(manifest(), { manifestUrl: "https://cdn.example.com/m.json" })).rejects.toMatchObject({ code: "REMOTE_LOAD_FAILED", owner: { mfeId: "asset-tracker" } })
  })

  it("does not retry protocol errors or non-definitions", async () => {
    const calls = { count: 0 }
    const fake = fakeInstance(async () => {
      calls.count += 1
      return { default: definition("2.0") }
    })
    const diagnostics = recordingSink()
    const loader = createModuleFederationLoader({ createInstance: fake.createInstance, diagnostics, sleep: async () => {} })
    await expect(loader.load(manifest(), { manifestUrl: "https://cdn.example.com/m.json" })).rejects.toMatchObject({ code: "PROTOCOL_INCOMPATIBLE" })
    expect(calls.count).toBe(1)
    expect(diagnostics.list({ type: "protocol.error" })).toHaveLength(1)
    const bad = fakeInstance(async () => ({ default: { hello: "world" } }))
    const loader2 = createModuleFederationLoader({ createInstance: bad.createInstance, sleep: async () => {} })
    await expect(loader2.load(manifest(), { manifestUrl: "https://cdn.example.com/m.json" })).rejects.toMatchObject({ code: "REMOTE_LOAD_FAILED", details: { fatal: true } })
  })

  it("honours the abort signal", async () => {
    const fake = fakeInstance(async () => ({ default: definition() }))
    const loader = createModuleFederationLoader({ createInstance: fake.createInstance })
    const controller = new AbortController()
    controller.abort()
    await expect(loader.load(manifest(), { manifestUrl: "https://cdn.example.com/m.json", signal: controller.signal })).rejects.toBeInstanceOf(PlatformError)
  })

  it("imports the refresh preamble for dev manifests (errors tolerated)", async () => {
    const fake = fakeInstance(async () => ({ default: definition() }))
    const importModule = vi.fn(async () => {
      throw new Error("no preamble")
    })
    const diagnostics = recordingSink()
    const loader = createModuleFederationLoader({ createInstance: fake.createInstance, importModule, diagnostics })
    const dev = manifest({ dev: { hmr: true, origin: "http://localhost:5173", refreshPreamble: "/@platform/refresh-preamble" } })
    await loader.load(dev, { manifestUrl: "http://localhost:5173/platform-manifest.json" })
    expect(importModule).toHaveBeenCalledWith("http://localhost:5173/@platform/refresh-preamble")
    expect(diagnostics.list({ level: "warn" })[0]?.type).toBe("log")
    expect((fake.registered[0]!.remotes[0] as { entry: string }).entry).toBe("http://localhost:5173/assets/remoteEntry.js")
  })

  it("builds a shared report from the share scope map and recorded decisions", async () => {
    const fake = fakeInstance(async () => ({ default: definition() }), {
      shareScopeMap: {
        react19: {
          react: { "19.3.0": { version: "19.3.0", from: "shell", loaded: true } },
          "react-dom": { "19.3.0": { version: "19.3.0", from: "shell", loaded: true } },
        },
        default: { zod: { "3.0.0": { version: "3.0.0", from: "shell", loaded: true } } },
      },
    })
    const loader = createModuleFederationLoader({ createInstance: fake.createInstance })
    await loader.register(manifest(), { manifestUrl: "https://cdn.example.com/m.json" })
    const report = loader.sharedReport("asset-tracker")
    const byName = Object.fromEntries(report.map((row) => [row.name, row]))
    expect(byName.react).toMatchObject({ outcome: "shared", version: "19.3.0", from: "shell", scope: "react19" })
    expect(byName["react-dom"]).toMatchObject({ outcome: "shared", from: "shell" })
    expect(byName.zod).toMatchObject({ outcome: "bundled", version: "4.6.5" })
    expect(byName["@tecton/react"]).toMatchObject({ outcome: "bundled", reason: expect.stringContaining("source package") })
    expect(loader.sharedReport("unknown")).toEqual([])
  })

  it("invalidate drops module cache entries and preload delegates to the runtime", async () => {
    const cache = new Map<string, unknown>([["mfe_asset_tracker", {}], ["other", {}]])
    const preloadRemote = vi.fn(async () => {})
    const fake = fakeInstance(async () => ({ default: definition() }), { moduleCache: cache as never, preloadRemote })
    const loader = createModuleFederationLoader({ createInstance: fake.createInstance })
    await loader.preload(manifest(), { manifestUrl: "https://cdn.example.com/m.json" })
    expect(preloadRemote).toHaveBeenCalledWith([{ nameOrAlias: "mfe_asset_tracker", exposes: ["./mfe"], resourceCategory: "sync" }])
    loader.invalidate("asset-tracker")
    expect(Array.from(cache.keys())).toEqual(["other"])
    expect(loader.federationNameOf("asset-tracker")).toBe("mfe_asset_tracker")
  })
})
