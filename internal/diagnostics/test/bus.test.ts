import { describe, expect, it, vi } from "vitest"
import {
  createMemoryTelemetryAdapter,
  createTelemetry,
  PlatformError,
} from "@platform-internal/core"

import { createDiagnosticsBus } from "../src/bus"

describe("diagnostics bus", () => {
  it("assigns ids, timestamps and levels", () => {
    const bus = createDiagnosticsBus({ now: () => 42 })
    const event = bus.emit({
      type: "remote.loading",
      entryUrl: "http://x/entry.js",
      mfeId: "a",
    })
    expect(event).toMatchObject({ id: 1, at: 42, level: "info", type: "remote.loading" })
    expect(
      bus.emit({ type: "shortcut.conflict", shortcut: "mod+k", holder: "a", rejected: "b" })
        ?.level
    ).toBe("warn")
    expect(bus.emit({ type: "log", message: "x", level: "error" })?.level).toBe("error")
    expect(bus.count).toBe(3)
  })

  it("keeps a ring buffer and filters", () => {
    const bus = createDiagnosticsBus({ limit: 3 })
    for (let i = 0; i < 5; i += 1)
      bus.emit({ type: "log", message: `m${i}`, mfeId: i % 2 ? "odd" : "even" })
    expect(bus.list().map((e) => e.id)).toEqual([3, 4, 5])
    expect(bus.list({ mfeId: "odd" }).map((e) => e.id)).toEqual([4])
    expect(bus.list({ minLevel: "info" })).toEqual([])
    expect(bus.list({ limit: 1 }).map((e) => e.id)).toEqual([5])
    expect(bus.list({ afterId: 4 }).map((e) => e.id)).toEqual([5])
    bus.clear()
    expect(bus.list()).toEqual([])
  })

  it("notifies listeners and isolates failures", () => {
    const bus = createDiagnosticsBus()
    const seen = vi.fn()
    bus.subscribe(() => {
      throw new Error("boom")
    })
    const unsubscribe = bus.subscribe(seen)
    expect(() => bus.emit({ type: "log", message: "x" })).not.toThrow()
    expect(seen).toHaveBeenCalledTimes(1)
    unsubscribe()
    bus.emit({ type: "log", message: "y" })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it("forwards warnings and errors to telemetry", () => {
    const adapter = createMemoryTelemetryAdapter()
    const bus = createDiagnosticsBus({ telemetry: createTelemetry({ adapter }) })
    bus.emit({ type: "log", message: "debug only" })
    const error = new PlatformError({ code: "MOUNT_FAILED", message: "nope" }).toJSON()
    bus.emit({ type: "mount.failed", error, mfeId: "a", instanceId: "a#1" })
    bus.emit({ type: "preflight.denied", missingGroups: ["admin"], mfeId: "a" })
    expect(adapter.events.map((e) => e.kind)).toEqual(["error", "track"])
    expect(adapter.events[0]?.attributes).toMatchObject({
      mfeId: "a",
      "error.code": "MOUNT_FAILED",
    })
  })

  it("scoped sinks tag events with their owner", () => {
    const bus = createDiagnosticsBus()
    const sink = bus.scoped({ mfeId: "a", instanceId: "a#1", widgetId: "card" })
    sink.emit({ type: "widget.mounted", slot: "s" })
    expect(bus.list()[0]).toMatchObject({ mfeId: "a", instanceId: "a#1", widgetId: "card" })
  })
})
