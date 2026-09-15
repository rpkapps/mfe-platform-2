import { describe, expect, it } from "vitest"
import {
  createCommandRegistry,
  createShellContextStore,
  parseRuntimeConfig,
  PlatformError,
} from "@platform-internal/core"

import { createDiagnosticsBus } from "../src/bus"
import { createSnapshot, redactSnapshot, serializeSnapshot } from "../src/snapshot"

describe("snapshot", () => {
  it("builds a serialisable, redacted snapshot from host state", () => {
    const bus = createDiagnosticsBus()
    bus.emit({ type: "route.matched", pathname: "/a/x", routeId: "/a/x", guarded: true, mfeId: "a", instanceId: "a#1" })
    bus.emit({ type: "route.guard", routeId: "/a/x", outcome: "redirected", detail: "/login", mfeId: "a", instanceId: "a#1" })
    bus.emit({ type: "hmr.update", kind: "module", file: "x.tsx", mfeId: "a" })
    const protocolError = new PlatformError({ code: "PROTOCOL_INCOMPATIBLE", message: "bad" }).toJSON()
    bus.emit({ type: "protocol.error", code: "PROTOCOL_INCOMPATIBLE", error: protocolError, mfeId: "b" })
    bus.emit({ type: "mount.failed", error: new PlatformError({ code: "MOUNT_FAILED", message: "m" }).toJSON(), mfeId: "a", instanceId: "a#1" })
    const commands = createCommandRegistry()
    commands.register({ id: "x", label: "X", handler: () => {} }, { mfeId: "a", instanceId: "a#1" })
    const context = createShellContextStore({
      user: { id: "u1", displayName: "Ada", email: "ada@example.com" },
      permissionGroups: ["a", "b"],
    })
    const snapshot = createSnapshot({
      runtimeConfig: parseRuntimeConfig({ mfes: { a: { env: { API_TOKEN: "secret", BASE: "x" } } } }),
      remotes: [
        {
          mfeId: "a",
          state: "mounted",
          attempts: 1,
          discoverable: true,
          enabled: true,
          loaded: true,
          dev: { hmr: true, restartRequired: true, restartReason: "manifest changed" },
          instances: [
            { instanceId: "a#1", mfeId: "a", state: "mounted", attempts: 1 },
            { instanceId: "a#w", mfeId: "a", widgetId: "card", state: "mounted", attempts: 1 },
          ],
        },
      ],
      commands: commands.list(),
      context: context.getState(),
      runtimeEnv: { a: { API_TOKEN: "secret", BASE: "x" } },
      telemetry: [{ kind: "track", name: "e", attributes: { password: "p", ok: 1 }, at: 1 }],
      diagnostics: bus.list(),
      now: 100,
    })
    expect(snapshot.routes).toEqual([
      expect.objectContaining({ routeId: "/a/x", guard: { outcome: "redirected", detail: "/login" } }),
    ])
    expect(snapshot.widgets.map((w) => w.widgetId)).toEqual(["card"])
    expect(snapshot.dev.hmrRemotes).toEqual(["a"])
    expect(snapshot.dev.restartRequired).toEqual([{ mfeId: "a", reason: "manifest changed" }])
    expect(snapshot.protocolErrors).toHaveLength(1)
    expect(snapshot.boundaryFailures.map((f) => f.type)).toEqual(["mount.failed"])
    expect(snapshot.commands.registered[0]?.qualifiedId).toBe("a:x")
    expect(snapshot.session).toMatchObject({ user: { id: "u1", displayName: "Ada" }, groupsCount: 2 })
    expect(snapshot.runtimeConfig.mfes.a?.env.API_TOKEN).toBe("•••")
    const redacted = redactSnapshot(snapshot)
    expect(redacted.runtimeEnv.a?.API_TOKEN).toBe("•••")
    expect(redacted.runtimeEnv.a?.BASE).toBe("x")
    expect(redacted.telemetry[0]?.attributes.password).toBe("•••")
    expect(JSON.stringify(redacted)).not.toContain("ada@example.com")
    expect(() => JSON.parse(serializeSnapshot(redacted))).not.toThrow()
  })
})
