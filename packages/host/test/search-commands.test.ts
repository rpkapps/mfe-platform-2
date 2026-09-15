import { describe, expect, it, vi } from "vitest"
import { createMemoryNavigation } from "@platform-internal/core"

import { runCommand } from "../src/commands"
import { createCommandSearchIndex, scoreEntry } from "../src/search"
import { installShortcutListener } from "../src/shortcuts"
import { createTestHost, definition, fakeFetch, fakeLoader, manifest, ORIGIN } from "./fixtures"

const MANIFEST_URL = `${ORIGIN}/mfes/asset-tracker/platform-manifest.json`
const owner = { mfeId: "asset-tracker", instanceId: "asset-tracker#1", displayName: "Asset tracker" }

describe("search index", () => {
  it("ranks commands, navigation, settings, help, release notes and breadcrumbs", async () => {
    const host = createTestHost({ fetch: fakeFetch({ [MANIFEST_URL]: manifest() }), loader: fakeLoader({ "asset-tracker": definition() }) })
    await host.remotes.load("asset-tracker")
    host.registries.commands.register({ id: "export", label: "Export assets", keywords: ["csv", "download"], description: "Download a CSV", handler: () => {} }, owner)
    host.registries.commands.register({ id: "restricted", label: "Restricted export", permissionGroups: ["finance"], handler: () => {} }, owner)
    host.registries.settings.register({ key: "display", title: "Display", fields: { density: { defaultValue: "comfortable", label: "Density", keywords: ["compact"] } } }, owner)
    host.registries.settings.register({ key: "advanced", title: "Advanced", managedBy: "mfe", route: "/settings", fields: {} }, owner)
    host.registries.releaseNotes.register({ id: "v2", version: "2.0.0", title: "Big release", summary: "Export improvements" }, owner)
    host.breadcrumbs.setShell([{ key: "home", label: "Home", href: "/", state: "ready", kind: "shell" }])
    const index = createCommandSearchIndex(host)
    const all = index.entries()
    expect(all.map((entry) => entry.kind)).toEqual(expect.arrayContaining(["command", "navigate", "setting", "help", "release-note", "breadcrumb"]))
    const exportResults = index.search("export")
    expect(exportResults[0]).toMatchObject({ kind: "command", label: "Export assets" })
    expect(exportResults.find((entry) => entry.label === "Restricted export")?.disabled).toBe(true)
    expect(exportResults.some((entry) => entry.kind === "release-note")).toBe(true)
    expect(index.search("csv")[0]?.label).toBe("Export assets")
    expect(index.search("compact")[0]).toMatchObject({ kind: "setting", label: "Density", settings: { groupKey: "display", fieldKey: "density" } })
    expect(index.search("assets", { kinds: ["navigate"] })[0]).toMatchObject({ kind: "navigate", href: "/asset-tracker" })
    expect(index.search("asset details")[0]).toMatchObject({ kind: "navigate", href: "/asset-tracker/assets/$assetId" })
    expect(index.search("advanced")[0]).toMatchObject({ kind: "setting", href: "/asset-tracker/settings" })
    expect(index.search("getting")[0]).toMatchObject({ kind: "help", qualifiedId: "asset-tracker:intro" })
    expect(index.search("home")[0]).toMatchObject({ kind: "breadcrumb", href: "/" })
    expect(index.search("go assets")[0]).toMatchObject({ kind: "command", qualifiedId: "asset-tracker:go-assets", href: "/asset-tracker/assets" })
    expect(index.search("zzzz")).toEqual([])
    expect(index.search("", { limit: 3 })).toHaveLength(3)
  })
  it("scores exact > prefix > word prefix > contains > keyword > description > fuzzy", () => {
    const entry = { kind: "command" as const, id: "x", label: "Open asset", keywords: ["pump"], description: "shows details", group: "Commands" }
    expect(scoreEntry(entry, "open asset")).toBe(100)
    expect(scoreEntry(entry, "open")).toBe(80)
    expect(scoreEntry(entry, "asset")).toBe(70)
    expect(scoreEntry(entry, "n as")).toBe(60)
    expect(scoreEntry(entry, "pump")).toBe(55)
    expect(scoreEntry(entry, "details")).toBe(30)
    expect(scoreEntry(entry, "oas")).toBeGreaterThan(0)
    expect(scoreEntry(entry, "xyz")).toBe(0)
  })
})

describe("runCommand", () => {
  it("reports states, telemetry and diagnostics; never throws", async () => {
    const host = createTestHost({ fetch: fakeFetch({}), loader: fakeLoader({}) })
    const states: string[] = []
    host.registries.commands.events.on("state", ({ state }) => states.push(state.status))
    host.registries.commands.register({ id: "ok", label: "Ok", handler: async () => {} }, owner)
    host.registries.commands.register({ id: "boom", label: "Boom", handler: () => { throw new Error("nope") } }, owner)
    host.registries.commands.register({ id: "nav", label: "Nav", route: "/assets/1", handler: undefined as never }, owner)
    expect(await runCommand(host, "asset-tracker:ok", { source: "palette" })).toMatchObject({ outcome: "succeeded" })
    expect(await runCommand(host, "asset-tracker:boom")).toMatchObject({ outcome: "failed", error: expect.objectContaining({ code: "COMMAND_FAILED" }) })
    expect(host.registries.commands.states()["asset-tracker:boom"]).toMatchObject({ status: "failed", error: "nope" })
    expect(await runCommand(host, "asset-tracker:missing")).toMatchObject({ outcome: "unknown" })
    expect(await runCommand(host, "asset-tracker:nav")).toMatchObject({ outcome: "navigated" })
    expect(host.navigation.getLocation().pathname).toBe("/asset-tracker/assets/1")
    expect(states).toEqual(["running", "succeeded", "running", "failed", "running", "succeeded"])
    expect(host.diagnostics.list({ type: "command.run" }).map((event) => (event as { outcome: string }).outcome)).toEqual(["started", "succeeded", "started", "failed", "failed", "started", "succeeded"])
    expect(host.telemetryEvents().some((event) => event.kind === "span" && event.name === "command.run")).toBe(true)
  })
  it("aborts long-running commands and hides unavailable ones", async () => {
    const host = createTestHost({ fetch: fakeFetch({}), loader: fakeLoader({}) })
    let seen: AbortSignal | undefined
    host.registries.commands.register({ id: "slow", label: "Slow", handler: ({ signal }) => new Promise<void>((resolve) => { seen = signal; signal.addEventListener("abort", () => resolve()) }) }, owner)
    host.registries.commands.register({ id: "restricted", label: "Restricted", permissionGroups: ["finance"], handler: () => {} }, owner)
    host.registries.commands.register({ id: "hidden", label: "Hidden", availability: () => false, handler: () => {} }, owner)
    const pending = host.commands.run("asset-tracker:slow")
    expect(host.commands.running()).toEqual(["asset-tracker:slow"])
    expect(host.commands.abort("asset-tracker:slow")).toBe(true)
    expect(seen?.aborted).toBe(true)
    expect(await pending).toMatchObject({ outcome: "cancelled" })
    expect(host.registries.commands.states()["asset-tracker:slow"]).toEqual({ status: "idle" })
    expect(await host.commands.run("asset-tracker:restricted")).toMatchObject({ outcome: "unavailable" })
    expect(await host.commands.run("asset-tracker:hidden")).toMatchObject({ outcome: "unavailable" })
    expect(host.commands.abort("asset-tracker:none")).toBe(false)
  })
})

describe("installShortcutListener", () => {
  it("dispatches shortcuts once per target and ignores editable targets", async () => {
    const host = createTestHost({ fetch: fakeFetch({}), loader: fakeLoader({}), navigation: createMemoryNavigation("/") })
    const handler = vi.fn()
    host.registries.commands.register({ id: "palette", label: "Palette", shortcut: "mod+shift+p", handler }, owner)
    const dispose = installShortcutListener(host, document)
    const again = installShortcutListener(host, document)
    expect(again).toBe(dispose)
    const fire = (target: Element, init: KeyboardEventInit) => {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
      target.dispatchEvent(event)
      return event
    }
    const event = fire(document.body, { key: "P", ctrlKey: true, shiftKey: true })
    await Promise.resolve()
    expect(handler).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    const input = document.createElement("input")
    document.body.append(input)
    fire(input, { key: "P", ctrlKey: true, shiftKey: true })
    const editable = document.createElement("div")
    editable.setAttribute("contenteditable", "true")
    Object.defineProperty(editable, "isContentEditable", { value: true })
    document.body.append(editable)
    fire(editable, { key: "P", ctrlKey: true, shiftKey: true })
    fire(document.body, { key: "P", ctrlKey: true })
    await Promise.resolve()
    expect(handler).toHaveBeenCalledTimes(1)
    dispose()
    fire(document.body, { key: "P", ctrlKey: true, shiftKey: true })
    await Promise.resolve()
    expect(handler).toHaveBeenCalledTimes(1)
    input.remove()
    editable.remove()
  })
})
