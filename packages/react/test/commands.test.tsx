import { describe, expect, it } from "vitest"
import { act, render } from "@testing-library/react"
import { useState } from "react"
import { CommandRegistration, useRegisterCommand } from "../src/hooks/registrations"
import { PlatformTestProvider } from "../src/testing"
import { bridgeFor, flush } from "./helpers"

describe("useRegisterCommand", () => {
  it("registers for the component lifetime, namespaced with the mfeId, and unregisters on unmount", () => {
    const bridge = bridgeFor({ mfeId: "a" })
    const Cmd = () => {
      useRegisterCommand({ id: "refresh", label: "Refresh", shortcut: "mod+r", handler: () => {} })
      return null
    }
    const view = render(
      <PlatformTestProvider bridge={bridge}>
        <Cmd />
      </PlatformTestProvider>
    )
    const registered = bridge.registries.commands.list()
    expect(registered).toHaveLength(1)
    expect(registered[0]).toMatchObject({ qualifiedId: "a:refresh", shortcut: "mod+r", owner: { mfeId: "a" } })
    expect(bridge.diagnostics.events.at(-1)).toMatchObject({ type: "registration", kind: "command", action: "added", key: "a:refresh" })
    view.unmount()
    expect(bridge.registries.commands.list()).toHaveLength(0)
    expect(bridge.diagnostics.events.at(-1)).toMatchObject({ type: "registration", action: "removed" })
  })

  it("keeps the latest handler without re-registering and re-registers when deps change", () => {
    const bridge = bridgeFor({ mfeId: "a" })
    const seen: string[] = []
    let setLabel!: (label: string) => void
    let setValue!: (value: string) => void
    const Cmd = () => {
      const [label, set] = useState("One")
      const [value, setV] = useState("v1")
      setLabel = set
      setValue = setV
      useRegisterCommand({ id: "x", label, handler: () => void seen.push(value) })
      return null
    }
    render(
      <PlatformTestProvider bridge={bridge}>
        <Cmd />
      </PlatformTestProvider>
    )
    const first = bridge.registries.commands.get("a:x")!
    act(() => setValue("v2"))
    expect(bridge.registries.commands.get("a:x")).toBe(first)
    void first.definition.handler({ signal: new AbortController().signal, source: "api", platform: null })
    expect(seen).toEqual(["v2"])
    act(() => setLabel("Two"))
    expect(bridge.registries.commands.get("a:x")).not.toBe(first)
    expect(bridge.registries.commands.get("a:x")!.definition.label).toBe("Two")
  })

  it("reports running / succeeded / failed states, telemetry and typed platform context", async () => {
    const bridge = bridgeFor({ mfeId: "a" })
    let resolveRun!: () => void
    let received: unknown
    render(
      <PlatformTestProvider bridge={bridge}>
        <CommandRegistration
          definition={{
            id: "slow",
            label: "Slow",
            handler: ({ platform }) => {
              received = platform
              return new Promise<void>((resolve) => {
                resolveRun = resolve
              })
            },
          }}
        />
        <CommandRegistration
          definition={{
            id: "bad",
            label: "Bad",
            handler: () => {
              throw new Error("nope")
            },
          }}
        />
      </PlatformTestProvider>
    )
    const registry = bridge.registries.commands
    const slow = registry.get("a:slow")!
    const run = slow.definition.handler({ signal: new AbortController().signal, source: "palette", platform: null })
    expect(registry.states()["a:slow"]).toMatchObject({ status: "running" })
    expect((received as { user: { displayName: string } }).user.displayName).toBe("Test User")
    resolveRun()
    await run
    expect(registry.states()["a:slow"]).toMatchObject({ status: "succeeded" })
    expect(bridge.diagnostics.events.filter((event) => event.type === "command.run").map((event) => (event as { outcome: string }).outcome)).toEqual(["started", "succeeded"])
    expect(bridge.telemetryEvents.some((event) => event.name === "command.run" && event.attributes.command === "a:slow")).toBe(true)

    const bad = registry.get("a:bad")!
    await expect(
      bad.definition.handler({ signal: new AbortController().signal, source: "api", platform: null })
    ).rejects.toMatchObject({ code: "COMMAND_FAILED", message: "nope" })
    expect(registry.states()["a:bad"]).toMatchObject({ status: "failed", error: "nope" })
  })

  it("treats an aborted run as cancelled", async () => {
    const bridge = bridgeFor({ mfeId: "a" })
    render(
      <PlatformTestProvider bridge={bridge}>
        <CommandRegistration
          definition={{
            id: "long",
            label: "Long",
            handler: ({ signal }) =>
              new Promise<void>((_resolve, reject) => {
                signal.addEventListener("abort", () => reject(new Error("aborted")))
              }),
          }}
        />
      </PlatformTestProvider>
    )
    const controller = new AbortController()
    const run = bridge.registries.commands.get("a:long")!.definition.handler({ signal: controller.signal, source: "shortcut", platform: null })
    controller.abort()
    await run
    expect(bridge.registries.commands.states()["a:long"]).toEqual({ status: "idle" })
    expect(bridge.diagnostics.events.at(-1)).toMatchObject({ type: "command.run", outcome: "cancelled" })
  })

  it("surfaces shortcut conflicts deterministically: the first holder keeps the shortcut", async () => {
    const bridge = bridgeFor({ mfeId: "a" })
    render(
      <PlatformTestProvider bridge={bridge}>
        <CommandRegistration definition={{ id: "first", label: "First", shortcut: "mod+k", handler: () => {} }} />
        <CommandRegistration definition={{ id: "second", label: "Second", shortcut: "mod+k", handler: () => {} }} />
      </PlatformTestProvider>
    )
    await flush()
    expect(bridge.registries.commands.get("a:first")!.shortcut).toBe("mod+k")
    expect(bridge.registries.commands.get("a:second")!.shortcut).toBeUndefined()
    expect(bridge.diagnostics.events.find((event) => event.type === "shortcut.conflict")).toMatchObject({ shortcut: "mod+k", holder: "a:first", rejected: "a:second" })
    expect(bridge.telemetryEvents.some((event) => event.name === "command.shortcut-conflict")).toBe(true)
  })

  it("namespaces widget commands with the instance id and navigates route commands", () => {
    const bridge = bridgeFor({ mfeId: "a", widgetId: "w", routePrefix: "/a" })
    render(
      <PlatformTestProvider bridge={bridge}>
        <CommandRegistration definition={{ id: "open", label: "Open", route: "/assets" }} />
      </PlatformTestProvider>
    )
    const command = bridge.registries.commands.list()[0]!
    expect(command.qualifiedId).toBe(`a:open@${bridge.instanceId}`)
    void command.definition.handler({ signal: new AbortController().signal, source: "api", platform: null })
    expect(bridge.navigation.getLocation().pathname).toBe("/a/assets")
  })
})
