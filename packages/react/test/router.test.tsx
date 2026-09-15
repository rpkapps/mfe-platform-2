import { describe, expect, it } from "vitest"
import { useState } from "react"
import { redirect, useRouteContext } from "@tanstack/react-router"
import { createMfe } from "../src/mfe"
import { createMfeRouter, disposeMfeRouter } from "../src/router"
import { bridgeFor, disposeAsync, flush, mountMfe, routeTreeOf } from "./helpers"

let renders = 0

function Root() {
  const platform = useRouteContext({ strict: false }).platform
  const [count, setCount] = useState(0)
  renders += 1
  return (
    <div>
      <p data-testid="user">{platform.user?.displayName}</p>
      <p data-testid="count">{count}</p>
      <button data-testid="inc" onClick={() => setCount((value) => value + 1)}>
        +
      </button>
    </div>
  )
}

const loaderCalls: number[] = []

function Secure() {
  return <p data-testid="secure">secure</p>
}

function buildDefinition() {
  const { routeTree } = routeTreeOf([
    {
      path: "/",
      component: Root,
      loader: ({ context }: { context: { platform: { revision: number } } }) => {
        loaderCalls.push(context.platform.revision)
        return { revision: context.platform.revision }
      },
    },
    {
      path: "/secure",
      component: Secure,
      beforeLoad: ({ context }: { context: { platform: { permissions: { hasGroup(g: string): boolean } } } }) => {
        if (!context.platform.permissions.hasGroup("assets:admin")) throw redirect({ to: "/" })
      },
      staticData: { permissionGroups: ["assets:admin"] },
    },
  ])
  return createMfe({ mfeId: "asset-tracker", routeTree })
}

describe("createMfeRouter", () => {
  it("uses the shell prefix as basepath and the shell navigation as history", async () => {
    const bridge = bridgeFor({ mfeId: "asset-tracker" })
    const router = createMfeRouter({ routeTree: buildDefinition().routeTree!, bridge })
    expect(router.basepath).toBe("/asset-tracker")
    expect(router.options.context).toMatchObject({ platform: expect.anything() })
    expect(router.options.context.platform.user?.displayName).toBe("Test User")
    bridge.setContext({ user: { id: "2", displayName: "Other" } })
    expect(router.options.context.platform.user?.displayName).toBe("Other")
    expect(router.options.context.platform.revision).toBe(1)
    disposeMfeRouter(router)
  })

  it("runs native guards: a beforeLoad redirect based on permission groups stays inside the MFE", async () => {
    const definition = buildDefinition()
    const bridge = bridgeFor({ mfeId: "asset-tracker", initialPath: "/asset-tracker/secure" })
    const { handle, container } = await mountMfe(definition, bridge)
    expect(bridge.navigation.getLocation().pathname).toBe("/asset-tracker")
    expect(container.querySelector("[data-testid=user]")?.textContent).toBe("Test User")
    expect(container.querySelector("[data-testid=secure]")).toBeNull()
    await disposeAsync(handle)
    container.remove()
  })

  it("re-runs guards and loaders after a context change without remounting", async () => {
    loaderCalls.length = 0
    const definition = buildDefinition()
    const bridge = bridgeFor({ mfeId: "asset-tracker" })
    const { handle, container } = await mountMfe(definition, bridge)
    expect(loaderCalls).toEqual([0])
    expect(container.querySelector("[data-testid=count]")?.textContent).toBe("0")
    container.querySelector<HTMLButtonElement>("[data-testid=inc]")!.click()
    await flush()
    expect(container.querySelector("[data-testid=count]")?.textContent).toBe("1")

    bridge.setContext({ user: { id: "2", displayName: "Admin" }, permissionGroups: ["assets:admin"] })
    await flush()
    // loader re-ran with the new revision, the component was not remounted (state survives)
    expect(loaderCalls).toEqual([0, 1])
    expect(container.querySelector("[data-testid=user]")?.textContent).toBe("Admin")
    expect(container.querySelector("[data-testid=count]")?.textContent).toBe("1")

    // the guard now allows the secure route
    bridge.navigation.push("/asset-tracker/secure")
    await flush()
    expect(container.querySelector("[data-testid=secure]")).not.toBeNull()
    expect(bridge.navigation.getLocation().pathname).toBe("/asset-tracker/secure")

    // removing the group re-runs the guard and redirects away
    bridge.setContext({ permissionGroups: [] })
    await flush()
    expect(bridge.navigation.getLocation().pathname).toBe("/asset-tracker")
    expect(container.querySelector("[data-testid=secure]")).toBeNull()

    await disposeAsync(handle)
    container.remove()
  })

  it("stops reacting to context changes after dispose", async () => {
    loaderCalls.length = 0
    const definition = buildDefinition()
    const bridge = bridgeFor({ mfeId: "asset-tracker" })
    const { handle, container } = await mountMfe(definition, bridge)
    await disposeAsync(handle)
    bridge.setContext({ theme: "dark" })
    await flush()
    expect(loaderCalls).toEqual([0])
    container.remove()
  })
})
