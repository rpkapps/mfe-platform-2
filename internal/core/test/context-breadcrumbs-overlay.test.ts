import { describe, expect, it, vi } from "vitest"

import { announceBreadcrumbs, createBreadcrumbStore, truncateBreadcrumbs } from "../src/breadcrumbs"
import { createInstanceContextStore, createPermissionHelpers, createShellContextStore } from "../src/context"
import { createOverlayManager } from "../src/overlay"
import { createMemoryNavigation, isUnderPrefix, parseHref } from "../src/navigation"
import { createStore, shallowEqual } from "../src/store"
import { createMemoryTelemetryAdapter, createTelemetry } from "../src/telemetry"

describe("stores and context", () => {
  it("slice subscriptions only fire on slice changes", () => {
    const store = createStore({ a: 1, b: { x: 1 } })
    const listener = vi.fn()
    store.select((s) => s.a, listener)
    store.patch({ b: { x: 2 } })
    expect(listener).not.toHaveBeenCalled()
    store.patch({ a: 2 })
    expect(listener).toHaveBeenCalledWith(2)
    expect(shallowEqual({ a: 1 }, { a: 1 })).toBe(true)
    expect(shallowEqual([1], [1, 2])).toBe(false)
  })
  it("shell context bumps revisions and derives instance views", () => {
    const shell = createShellContextStore({ user: { id: "u1", displayName: "Ada" }, permissionGroups: ["viewer"] })
    const instance = createInstanceContextStore(shell, { mfeId: "a", instanceId: "a#1", capabilities: ["context"], runtime: { environment: "test", env: { K: 1 }, shared: {} } })
    const nameListener = vi.fn()
    instance.select((s) => s.user?.displayName, nameListener)
    shell.patch({ theme: "dark" })
    expect(nameListener).not.toHaveBeenCalled()
    expect(shell.getState().revision).toBe(1)
    shell.patch({ user: { id: "u1", displayName: "Ada L." } })
    expect(nameListener).toHaveBeenCalledWith("Ada L.")
    expect(instance.getState()).toMatchObject({ mfeId: "a", runtime: { env: { K: 1 } }, theme: "dark" })
    const helpers = createPermissionHelpers(["viewer", "editor"])
    expect(helpers.hasGroup("viewer")).toBe(true)
    expect(helpers.hasAnyGroup(["admin", "editor"])).toBe(true)
    expect(helpers.hasAllGroups(["admin", "editor"])).toBe(false)
  })
})

describe("breadcrumbs", () => {
  it("combines shell entries with the active trail, truncates and announces", () => {
    const store = createBreadcrumbStore()
    store.setShell([{ key: "home", label: "Home", href: "/", state: "ready", kind: "shell" }])
    store.publish({ owner: { mfeId: "a", instanceId: "a#1" }, updatedAt: 1, entries: [
      { key: "root", label: "Assets", href: "/assets", state: "ready", kind: "mfe-root" },
      { key: "x", label: "Pump 42", state: "loading", kind: "route" },
    ] })
    store.setActive("a#1")
    expect(store.current().map((e) => e.label)).toEqual(["Home", "Assets", "Pump 42"])
    expect(announceBreadcrumbs(store.current())).toBe("Home, Assets, Pump 42 (loading)")
    const many = Array.from({ length: 8 }, (_, i) => ({ key: String(i), label: `L${i}`, state: "ready" as const, kind: "route" as const }))
    const truncated = truncateBreadcrumbs(many, 5, 2)
    expect(truncated).toHaveLength(4)
    expect((truncated[1] as { ellipsis: boolean }).ellipsis).toBe(true)
    store.clear("a#1")
    expect(store.current()).toHaveLength(1)
  })
})

describe("navigation", () => {
  it("memory navigation supports push, replace, back, forward", () => {
    const nav = createMemoryNavigation("/")
    const listener = vi.fn()
    nav.subscribe(listener)
    nav.push("/a?x=1#h")
    expect(nav.getLocation()).toMatchObject({ pathname: "/a", search: "?x=1", hash: "#h" })
    nav.back()
    expect(nav.getLocation().pathname).toBe("/")
    nav.forward()
    expect(nav.getLocation().pathname).toBe("/a")
    nav.replace("/b")
    expect(nav.entries).toHaveLength(2)
    expect(listener).toHaveBeenCalledTimes(4)
    expect(parseHref("/x")).toEqual({ pathname: "/x", search: "", hash: "" })
    expect(isUnderPrefix("/asset-tracker/1", "/asset-tracker")).toBe(true)
    expect(isUnderPrefix("/asset-trackers", "/asset-tracker")).toBe(false)
  })
})

describe("overlay manager", () => {
  it("creates owner-tagged roots on the body and layers overlays deterministically", async () => {
    const manager = createOverlayManager({ document })
    const root = manager.createRoot({ owner: { mfeId: "a", instanceId: "a#1" } })
    expect(root.element.parentElement).toBe(document.body)
    expect(root.element.getAttribute("data-mfe")).toBe("a")
    const first = document.createElement("div")
    const second = document.createElement("div")
    root.element.append(first)
    await new Promise((r) => setTimeout(r, 0))
    root.element.append(second)
    await new Promise((r) => setTimeout(r, 0))
    const state = manager.getState()
    expect(state.layers).toHaveLength(2)
    expect(Number(second.style.zIndex)).toBeGreaterThan(Number(first.style.zIndex))
    expect(document.body.getAttribute("data-platform-modal-count")).toBe("2")
    expect(manager.hasOpenModal()).toBe(true)
    root.dispose()
    expect(manager.hasOpenModal()).toBe(false)
    expect(root.element.isConnected).toBe(false)
  })
})

describe("telemetry", () => {
  it("enriches events and isolates adapter failures", () => {
    const adapter = createMemoryTelemetryAdapter()
    const telemetry = createTelemetry({ adapter, context: { mfeId: "a", instanceId: "a#1" } })
    telemetry.child({ route: "/x" }).track("clicked", { n: 1 })
    expect(adapter.events[0]).toMatchObject({ kind: "track", name: "clicked", attributes: { mfeId: "a", route: "/x", n: 1 } })
    const span = telemetry.span("load")
    span.end({ ok: true })
    expect(adapter.events[1]).toMatchObject({ kind: "span", name: "load" })
    const failing = createTelemetry({ adapter: { track: () => { throw new Error("boom") }, error: () => {} }, onAdapterError: vi.fn() })
    expect(() => failing.track("x")).not.toThrow()
  })
})
