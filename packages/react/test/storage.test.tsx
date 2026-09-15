import { describe, expect, it } from "vitest"
import { act, render } from "@testing-library/react"
import { z } from "zod"
import { createPlatformStorage, usePlatformStorage, useStorageDiagnostics } from "../src/storage"
import { PlatformTestProvider } from "../src/testing"
import { bridgeFor } from "./helpers"

const schema = z.object({ layout: z.enum(["grid", "list"]), pageSize: z.number().int() })
const dashboard = createPlatformStorage({
  scope: "local",
  key: "dashboard",
  schema,
  defaults: { layout: "grid", pageSize: 20 },
  version: 2,
  migrate: (stored) =>
    stored && typeof stored === "object" && "layout" in stored
      ? { layout: (stored as { layout: "grid" | "list" }).layout, pageSize: 20 }
      : undefined,
})

describe("createPlatformStorage", () => {
  it("namespaces keys, validates writes and notifies same-tab subscribers", () => {
    const bridge = bridgeFor({ mfeId: "asset-tracker" })
    let renders = 0
    const View = () => {
      renders += 1
      const layout = dashboard.use((value) => value.layout)
      const size = usePlatformStorage(dashboard, (value) => value.pageSize)
      return (
        <div>
          <span data-testid="layout">{layout}</span>
          <span data-testid="size">{size}</span>
          <button onClick={() => dashboard.setKey("layout", "list")}>list</button>
        </div>
      )
    }
    const view = render(
      <PlatformTestProvider bridge={bridge}>
        <View />
      </PlatformTestProvider>
    )
    expect(view.getByTestId("layout").textContent).toBe("grid")
    act(() => view.getByText("list").click())
    expect(view.getByTestId("layout").textContent).toBe("list")
    expect(bridge.storage.keys("local")).toEqual(["platform:asset-tracker:local:dashboard"])
    expect(JSON.parse(bridge.storage.get("local", "platform:asset-tracker:local:dashboard")!)).toMatchObject({ v: 2, data: { layout: "list", pageSize: 20 } })
    expect(dashboard.get().layout).toBe("list")
    expect(() => dashboard.set({ layout: "grid", pageSize: 1.5 })).toThrowError(expect.objectContaining({ code: "STORAGE_INVALID" }))
    act(() => dashboard.reset())
    expect(view.getByTestId("layout").textContent).toBe("grid")
    expect(renders).toBe(3)
    view.unmount()
  })

  it("applies cross-tab updates, migrations and reports invalid data as diagnostics", () => {
    const bridge = bridgeFor({ mfeId: "asset-tracker" })
    bridge.storage.set("local", "platform:asset-tracker:local:dashboard", JSON.stringify({ v: 1, data: { layout: "list" }, updatedAt: 0 }))
    const View = () => {
      const value = dashboard.use()
      const diagnostics = useStorageDiagnostics()
      return (
        <div>
          <span data-testid="layout">{value.layout}</span>
          <span data-testid="diag">{diagnostics.length}</span>
        </div>
      )
    }
    const view = render(
      <PlatformTestProvider bridge={bridge}>
        <View />
      </PlatformTestProvider>
    )
    expect(view.getByTestId("layout").textContent).toBe("list")
    expect(view.getByTestId("diag").textContent).toBe("0")

    act(() => bridge.storage.emitExternal("local", "platform:asset-tracker:local:dashboard", JSON.stringify({ v: 2, data: { layout: "grid", pageSize: 5 }, updatedAt: 1 })))
    expect(view.getByTestId("layout").textContent).toBe("grid")

    act(() => bridge.storage.emitExternal("local", "platform:asset-tracker:local:dashboard", "{not json"))
    expect(view.getByTestId("layout").textContent).toBe("grid")
    expect(view.getByTestId("diag").textContent).toBe("1")
    expect(bridge.diagnostics.events.at(-1)).toMatchObject({ type: "storage.invalid", recovered: "defaults", mfeId: "asset-tracker" })
    view.unmount()
  })

  it("scopes instance stores per instance and disposes stores with the mount", () => {
    const counter = createPlatformStorage({ scope: "session", key: "counter", defaults: { n: 0 }, instanceScoped: true })
    const bridge = bridgeFor({ mfeId: "widget-lib", widgetId: "w", instanceId: "widget-lib#1" })
    const store = counter.bind({ bridge })
    expect(store.namespacedKey).toBe("platform:widget-lib:widget-lib#1:session:counter")
    const View = () => <span>{counter.use((value) => value.n)}</span>
    const view = render(
      <PlatformTestProvider bridge={bridge}>
        <View />
      </PlatformTestProvider>
    )
    act(() => counter.set({ n: 3 }))
    expect(view.container.textContent).toBe("3")
    view.unmount()
    expect(() => counter.get()).toThrowError(expect.objectContaining({ code: "INTERNAL" }))
  })
})
