import { describe, expect, it, vi } from "vitest"

import {
  createCommandRegistry,
  matchesShortcut,
  normalizeShortcut,
} from "../src/registrations/commands"
import { createHelpRegistry, createReleaseNotesRegistry } from "../src/registrations/help"
import {
  createSettingsRegistry,
  humanizeKey,
  inferFieldKind,
  resolveFieldValue,
  validateCommit,
} from "../src/registrations/settings"
import { z } from "zod"

const owner = (instanceId = "asset-tracker#1") => ({ mfeId: "asset-tracker", instanceId })

describe("command registry", () => {
  it("namespaces ids and cleans up", () => {
    const registry = createCommandRegistry()
    const dispose = registry.register(
      { id: "open-asset", label: "Open asset", handler: () => {} },
      owner()
    )
    expect(registry.list().map((c) => c.qualifiedId)).toEqual(["asset-tracker:open-asset"])
    dispose()
    expect(registry.list()).toEqual([])
  })
  it("rejects shortcut conflicts deterministically", () => {
    const registry = createCommandRegistry()
    const conflicts = vi.fn()
    registry.events.on("conflict", conflicts)
    registry.register(
      { id: "a", label: "A", shortcut: "Mod+Shift+K", handler: () => {} },
      owner()
    )
    registry.register(
      { id: "b", label: "B", shortcut: "shift+mod+k", handler: () => {} },
      owner("asset-tracker#2")
    )
    expect(registry.get("asset-tracker:a")?.shortcut).toBe("mod+shift+k")
    expect(registry.get("asset-tracker:b")?.shortcut).toBeUndefined()
    expect(registry.conflicts()).toHaveLength(1)
    expect(conflicts).toHaveBeenCalledWith(
      expect.objectContaining({ holder: "asset-tracker:a", rejected: "asset-tracker:b" })
    )
    expect(registry.byShortcut("mod+shift+k")?.qualifiedId).toBe("asset-tracker:a")
  })
  it("validates definitions", () => {
    const registry = createCommandRegistry()
    expect(() =>
      registry.register({ id: "Bad Id", label: "x", handler: () => {} }, owner())
    ).toThrowError(/kebab-case/)
    expect(() =>
      registry.register(
        { id: "x", label: "x", shortcut: "foo+bar", handler: () => {} },
        owner()
      )
    ).toThrowError(/malformed shortcut/)
    expect(() =>
      registry.register({ id: "x", label: "", handler: () => {} }, owner())
    ).toThrowError(/label/)
  })
  it("widget commands are instance scoped", () => {
    const registry = createCommandRegistry()
    registry.register(
      { id: "refresh", label: "Refresh", handler: () => {} },
      { ...owner("w#1"), widgetId: "card" }
    )
    registry.register(
      { id: "refresh", label: "Refresh", handler: () => {} },
      { ...owner("w#2"), widgetId: "card" }
    )
    expect(registry.list()).toHaveLength(2)
    registry.clearOwner("w#1")
    expect(registry.list().map((c) => c.qualifiedId)).toEqual(["asset-tracker:refresh@w#2"])
  })
  it("normalises and matches shortcuts", () => {
    expect(normalizeShortcut("Ctrl+Alt+P")).toBe("ctrl+alt+p")
    expect(normalizeShortcut("mod")).toBeNull()
    expect(
      matchesShortcut(
        "mod+k",
        { key: "k", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        "other"
      )
    ).toBe(true)
    expect(
      matchesShortcut(
        "mod+k",
        { key: "k", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false },
        "mac"
      )
    ).toBe(true)
    expect(
      matchesShortcut(
        "mod+k",
        { key: "k", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        "mac"
      )
    ).toBe(false)
    expect(
      matchesShortcut(
        "mod+shift+k",
        { key: "K", ctrlKey: true, metaKey: false, altKey: false, shiftKey: true },
        "other"
      )
    ).toBe(true)
  })
})

describe("settings registry", () => {
  it("infers kinds and labels", () => {
    expect(humanizeKey("displayDensity")).toBe("Display density")
    expect(inferFieldKind({ defaultValue: true })).toBe("boolean")
    expect(inferFieldKind({ defaultValue: "a", options: [] })).toBe("select")
    expect(inferFieldKind({ defaultValue: ["a"], options: [] })).toBe("multi-select")
    expect(inferFieldKind({ defaultValue: 3 })).toBe("number")
  })
  it("registers groups with field metadata and lifecycle cleanup", () => {
    const registry = createSettingsRegistry()
    const dispose = registry.register(
      {
        key: "display",
        title: "Display",
        fields: {
          density: {
            defaultValue: "comfortable",
            options: [{ value: "comfortable", label: "Comfortable" }],
          },
          showTips: { defaultValue: true },
        },
      },
      owner()
    )
    const group = registry.get("asset-tracker:display")!
    expect(group.fields.map((f) => [f.key, f.kind, f.label])).toEqual([
      ["density", "select", "Density"],
      ["showTips", "boolean", "Show tips"],
    ])
    dispose()
    expect(registry.list()).toEqual([])
  })
  it("rejects `value`, missing defaults and bad schemas", () => {
    const registry = createSettingsRegistry()
    expect(() =>
      registry.register({ key: "x", fields: { a: { value: 1 } as never } }, owner())
    ).toThrowError(/defaultValue/)
    expect(() =>
      registry.register(
        { key: "x", fields: { a: { defaultValue: "no", schema: z.number() } } },
        owner()
      )
    ).toThrowError(/fails its schema/)
    expect(() =>
      registry.register({ key: "x", managedBy: "mfe", fields: {} }, owner())
    ).toThrowError(/route/)
  })
  it("resolves stored values with validation, migration and reset", () => {
    const field = {
      defaultValue: 10,
      schema: z.number().min(0),
      version: 2,
      migrate: (stored: unknown) => (typeof stored === "string" ? Number(stored) : undefined),
    }
    expect(resolveFieldValue(field, undefined)).toMatchObject({ value: 10, origin: "default" })
    expect(resolveFieldValue(field, { v: 2, value: 5 })).toMatchObject({
      value: 5,
      origin: "stored",
    })
    expect(resolveFieldValue(field, { v: 1, value: "7" })).toMatchObject({
      value: 7,
      origin: "migrated",
    })
    expect(resolveFieldValue(field, { v: 2, value: -1 })).toMatchObject({
      value: 10,
      origin: "default",
      validation: { valid: false, recovered: "default" },
    })
    expect(
      resolveFieldValue({ defaultValue: 1, schema: z.number() }, { v: undefined, value: "x" })
    ).toMatchObject({ value: 1, validation: { valid: false } })
    expect(validateCommit(field, -2)).toMatchObject({ ok: false })
    expect(validateCommit(field, 2)).toEqual({ ok: true, value: 2 })
  })
})

describe("help and release notes", () => {
  it("register and clean up by owner", () => {
    const help = createHelpRegistry()
    const notes = createReleaseNotesRegistry()
    help.register(
      { id: "getting-started", title: "Getting started", href: "https://x" },
      owner()
    )
    notes.register({ id: "v1", version: "1.0.0", title: "First" }, owner())
    expect(help.list()[0]?.qualifiedId).toBe("asset-tracker:getting-started")
    notes.clearOwner("asset-tracker#1")
    expect(notes.list()).toEqual([])
    expect(() => help.register({ id: "Bad", title: "x" }, owner())).toThrowError(/kebab-case/)
  })
})
