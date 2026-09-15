import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { createBrowserStorageBackend, createMemoryStorageBackend, createStorageStore } from "../src/storage"

const schema = z.object({ columns: z.array(z.string()), density: z.enum(["compact", "comfortable"]) })
const defaults = { columns: ["name"], density: "comfortable" as const }

describe("storage store", () => {
  it("namespaces keys, validates, persists an envelope and notifies subscribers", () => {
    const backend = createMemoryStorageBackend()
    const store = createStorageStore({ scope: "local", key: "dashboard", owner: { mfeId: "asset-tracker" }, schema, defaults, backend })
    expect(store.namespacedKey).toBe("platform:asset-tracker:local:dashboard")
    const listener = vi.fn()
    store.select((s) => s.density, listener)
    store.set({ columns: ["name", "id"], density: "compact" })
    expect(JSON.parse(backend.get("local", store.namespacedKey)!)).toMatchObject({ v: 1, data: { density: "compact" } })
    expect(listener).toHaveBeenCalledWith("compact")
    store.setKey("columns", (c) => [...c, "x"])
    expect(store.get().columns).toEqual(["name", "id", "x"])
    expect(() => store.set({ columns: [], density: "loose" as never })).toThrowError(/fails its schema/)
    store.reset()
    expect(store.get()).toEqual(defaults)
  })
  it("recovers from malformed and invalid data with diagnostics", () => {
    const backend = createMemoryStorageBackend()
    backend.set("local", "platform:asset-tracker:local:dashboard", "{not json")
    const diagnostics = vi.fn()
    const store = createStorageStore({ scope: "local", key: "dashboard", owner: { mfeId: "asset-tracker" }, schema, defaults, backend, onDiagnostic: diagnostics })
    expect(store.get()).toEqual(defaults)
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ code: "STORAGE_INVALID", recovered: "defaults" }))
    backend.set("local", store.namespacedKey, JSON.stringify({ v: 1, data: { columns: "x" } }))
    expect(store.get()).toEqual(defaults)
    expect(store.lastError?.message).toMatch(/invalid/)
  })
  it("migrates older versions", () => {
    const backend = createMemoryStorageBackend()
    backend.set("session", "platform:asset-tracker:session:dashboard", JSON.stringify({ v: 1, data: { cols: ["a"] } }))
    const store = createStorageStore({ scope: "session", key: "dashboard", owner: { mfeId: "asset-tracker" }, schema, defaults, backend, version: 2, migrate: (stored) => ({ columns: (stored as { cols: string[] }).cols, density: "compact" as const }) })
    expect(store.get()).toEqual({ columns: ["a"], density: "compact" })
  })
  it("receives cross-tab updates", () => {
    const backend = createMemoryStorageBackend()
    const store = createStorageStore({ scope: "local", key: "dashboard", owner: { mfeId: "asset-tracker" }, schema, defaults, backend })
    backend.emitExternal("local", store.namespacedKey, JSON.stringify({ v: 1, data: { columns: ["remote"], density: "compact" } }))
    expect(store.get().columns).toEqual(["remote"])
  })
  it("instance scoping changes the namespace", () => {
    const backend = createMemoryStorageBackend()
    const store = createStorageStore({ scope: "local", key: "k", owner: { mfeId: "m", instanceId: "m#1", instanceScoped: true }, defaults: 1, backend })
    expect(store.namespacedKey).toBe("platform:m:m#1:local:k")
  })
})

describe("browser backend", () => {
  it("uses window storage, listens to storage events, never patches window", () => {
    const backend = createBrowserStorageBackend(window)
    const original = window.localStorage.setItem
    backend.set("local", "platform:x:local:a", "1")
    expect(window.localStorage.getItem("platform:x:local:a")).toBe("1")
    const listener = vi.fn()
    backend.subscribe("local", "platform:x:local:a", listener)
    window.dispatchEvent(new StorageEvent("storage", { key: "platform:x:local:a", newValue: "2", storageArea: window.localStorage }))
    expect(listener).toHaveBeenCalledWith("2", "cross-tab")
    expect(window.localStorage.setItem).toBe(original)
    expect(backend.keys("local", "platform:x")).toEqual(["platform:x:local:a"])
    backend.dispose()
  })
})
