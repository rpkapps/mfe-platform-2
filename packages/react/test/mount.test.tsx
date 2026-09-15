import { describe, expect, it } from "vitest"
import { z } from "zod"
import { useEffect } from "react"
import { createMfe, createWidget } from "../src/mfe"
import { useRegisterCommand } from "../src/hooks/registrations"
import { useNavigation, usePlatform } from "../src/hooks/context"
import { bridgeFor, disposeAsync, flush, mountMfe, mountWidget, routeTreeOf } from "./helpers"

function Home() {
  useRegisterCommand({ id: "refresh", label: "Refresh", handler: () => {} })
  return <h1>Home</h1>
}

describe("createMfe", () => {
  it("describes the remote", () => {
    const { routeTree } = routeTreeOf([{ path: "/", component: Home }])
    const definition = createMfe({
      mfeId: "asset-tracker",
      routeTree,
      widgets: { summary: createWidget({ component: () => null, title: "Summary" }) },
      registrations: { commands: [{ id: "open", label: "Open", route: "/" }] },
    })
    expect(definition.kind).toBe("platform-remote")
    expect(definition.protocolVersion).toBe("1.0")
    expect(definition.hasRoutes).toBe(true)
    expect(definition.widgets).toEqual([{ id: "summary", title: "Summary", description: undefined }])
    expect(definition.registrations?.commands?.[0]?.id).toBe("open")
  })

  it("rejects an invalid or missing mfeId", () => {
    expect(() => createMfe({ mfeId: "Bad Id" })).toThrowError(/not a valid mfeId/)
    expect(() => createMfe({})).toThrowError(/needs an mfeId/)
  })

  it("mounts into an isolated root and cleans everything on dispose", async () => {
    const { routeTree } = routeTreeOf([{ path: "/", component: Home }])
    const definition = createMfe({ mfeId: "asset-tracker", routeTree })
    const bridge = bridgeFor({ mfeId: "asset-tracker" })
    const { handle, container } = await mountMfe(definition, bridge)

    const root = container.querySelector("[data-platform-root]")!
    expect(root).not.toBeNull()
    expect(root.getAttribute("data-mfe")).toBe("asset-tracker")
    expect(root.getAttribute("data-platform-instance")).toBe(bridge.instanceId)
    expect(root.textContent).toContain("Home")
    expect(bridge.registries.commands.list().map((command) => command.qualifiedId)).toEqual([
      "asset-tracker:refresh",
    ])
    expect(bridge.breadcrumbs.getState().activeInstanceId).toBe(bridge.instanceId)
    expect(bridge.breadcrumbs.getState().trails[bridge.instanceId]).toBeDefined()
    expect(bridge.diagnostics.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["mount.started", "mount.completed"])
    )
    const completed = bridge.diagnostics.events.find((event) => event.type === "mount.completed")
    expect(completed).toMatchObject({ reactVersion: expect.stringMatching(/^1[89]\./) })
    expect(bridge.telemetryEvents.some((event) => event.name === "mount")).toBe(true)

    await disposeAsync(handle)
    expect(container.querySelector("[data-platform-root]")).toBeNull()
    expect(bridge.registries.commands.list()).toEqual([])
    expect(bridge.breadcrumbs.getState().trails[bridge.instanceId]).toBeUndefined()
    expect(bridge.diagnostics.events.at(-1)?.type).toBe("registration")
    expect(bridge.diagnostics.events.some((event) => event.type === "unmount")).toBe(true)
    container.remove()
  })

  it("throws MOUNT_FAILED without a route tree and renders nothing", () => {
    const definition = createMfe({ mfeId: "widgets-only" })
    const bridge = bridgeFor({ mfeId: "widgets-only" })
    const container = document.createElement("div")
    expect(() => definition.mount({ container, bridge })).toThrowError(
      expect.objectContaining({ code: "MOUNT_FAILED", owner: { mfeId: "widgets-only", instanceId: bridge.instanceId } })
    )
    expect(container.childElementCount).toBe(0)
    expect(bridge.diagnostics.events.at(-1)?.type).toBe("mount.failed")
  })
})

describe("mountWidget", () => {
  const Card = ({ title, count }: { title: string; count: number }) => {
    const platform = usePlatform((p) => p.user?.displayName)
    const navigation = useNavigation()
    return (
      <div>
        <span data-testid="title">{title}</span>
        <span data-testid="count">{count}</span>
        <span data-testid="user">{platform}</span>
        <button onClick={() => navigation.navigate("/elsewhere")}>go</button>
      </div>
    )
  }
  const definition = createMfe({
    mfeId: "widget-lib",
    widgets: [
      createWidget({
        id: "card",
        component: Card,
        propsSchema: z.object({ title: z.string(), count: z.number().int() }),
      }),
    ],
  })

  it("renders with props, updates with setProps and disposes", async () => {
    const bridge = bridgeFor({ mfeId: "widget-lib", widgetId: "card", routePrefix: null })
    const { handle, container } = await mountWidget(definition, bridge, "card", { title: "A", count: 1 })
    const root = container.querySelector("[data-platform-root]")!
    expect(root.getAttribute("data-platform-widget")).toBe("card")
    expect(root.querySelector("[data-testid=title]")?.textContent).toBe("A")
    expect(root.querySelector("[data-testid=user]")?.textContent).toBe("Test User")

    handle.setProps({ title: "B", count: 2 })
    await flush()
    expect(root.querySelector("[data-testid=title]")?.textContent).toBe("B")
    expect(root.querySelector("[data-testid=count]")?.textContent).toBe("2")

    root.querySelector("button")!.click()
    expect(bridge.navigation.getLocation().pathname).toBe("/elsewhere")
    expect(bridge.diagnostics.events.some((event) => event.type === "widget.mounted")).toBe(true)

    await disposeAsync(handle)
    expect(container.querySelector("[data-platform-root]")).toBeNull()
    expect(bridge.diagnostics.events.at(-1)?.type).toBe("widget.unmounted")
    container.remove()
  })

  it("rejects invalid props and unknown widgets", async () => {
    const bridge = bridgeFor({ mfeId: "widget-lib", widgetId: "card", routePrefix: null })
    const container = document.createElement("div")
    expect(() =>
      definition.mountWidget({ container, bridge, widgetId: "card", props: { title: 1 } })
    ).toThrowError(expect.objectContaining({ code: "WIDGET_MOUNT_FAILED" }))
    expect(container.childElementCount).toBe(0)
    expect(() =>
      definition.mountWidget({ container, bridge, widgetId: "nope", props: {} })
    ).toThrowError(expect.objectContaining({ code: "WIDGET_UNKNOWN" }))

    const { handle } = await mountWidget(definition, bridge, "card", { title: "A", count: 1 })
    expect(() => handle.setProps({ title: "A", count: "x" })).toThrowError(/invalid/)
    await disposeAsync(handle)
  })

  it("keeps a widget that throws in an effect isolated from the host", async () => {
    const Broken = () => {
      useEffect(() => {
        throw new Error("boom")
      }, [])
      return <p>never</p>
    }
    const broken = createMfe({ mfeId: "broken", widgets: { broken: createWidget({ component: Broken }) } })
    const bridge = bridgeFor({ mfeId: "broken", widgetId: "broken", routePrefix: null })
    const { handle, container } = await mountWidget(broken, bridge, "broken", {})
    expect(container.querySelector("[data-platform-error-fallback]")).not.toBeNull()
    expect(bridge.diagnostics.events.some((event) => event.type === "error")).toBe(true)
    await disposeAsync(handle)
  })
})
