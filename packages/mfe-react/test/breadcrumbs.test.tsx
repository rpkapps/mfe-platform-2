import { describe, expect, it } from "vitest"
import { useState } from "react"
import { useBreadcrumb } from "../src/breadcrumbs"
import { createMfe } from "../src/mfe"
import { bridgeFor, disposeAsync, flush, mountMfe, routeTreeOf } from "./helpers"

const entriesOf = (bridge: ReturnType<typeof bridgeFor>) =>
  bridge.breadcrumbs.getState().trails[bridge.instanceId]?.entries.map((entry) => ({
    key: entry.key,
    label: entry.label,
    href: entry.href,
    state: entry.state,
    kind: entry.kind,
    hidden: entry.hidden,
  }))

let resolveAsset!: (value: { title: string }) => void

function Asset() {
  return <p>asset</p>
}

function Override() {
  const [label, setLabel] = useState("Draft")
  useBreadcrumb(label)
  return <button onClick={() => setLabel("Final")}>rename</button>
}

function build() {
  const { routeTree } = routeTreeOf(
    [
      {
        path: "/",
        component: () => <p>home</p>,
        staticData: { breadcrumb: { hidden: true, label: "Home" } },
      },
      { path: "/assets", component: () => <p>assets</p>, staticData: { breadcrumb: "Assets" } },
      {
        path: "/assets/$assetId",
        component: Asset,
        staticData: { breadcrumb: { fromLoader: "title", dynamic: true } },
        loader: () => new Promise<{ title: string }>((resolve) => (resolveAsset = resolve)),
      },
      {
        path: "/dynamic/$id",
        component: () => <p>dyn</p>,
        staticData: {
          breadcrumb: {
            label: (match: { params: { id: string } }) => `Item ${match.params.id}`,
          },
        },
      },
      {
        path: "/broken",
        component: () => <p>broken</p>,
        staticData: {
          breadcrumb: {
            label: () => {
              throw new Error("no label")
            },
          },
        },
      },
      { path: "/override", component: Override, staticData: { breadcrumb: "Static" } },
      {
        path: "/from-loader",
        component: () => <p>fl</p>,
        loader: () => ({ breadcrumb: "From loader" }),
      },
    ],
    { staticData: { breadcrumb: "Asset tracker" } }
  )
  return createMfe({ mfeId: "asset-tracker", routeTree })
}

describe("breadcrumbs", () => {
  it("publishes root, static, hidden, dynamic, loader-derived and unavailable entries with absolute hrefs", async () => {
    const definition = build()
    const bridge = bridgeFor({ mfeId: "asset-tracker" })
    const { handle, container } = await mountMfe(definition, bridge)
    expect(entriesOf(bridge)).toEqual([
      {
        key: "__root__",
        label: "Asset tracker",
        href: "/asset-tracker",
        state: "ready",
        kind: "mfe-root",
        hidden: undefined,
      },
      {
        key: "/",
        label: "Home",
        href: "/asset-tracker",
        state: "ready",
        kind: "route",
        hidden: true,
      },
    ])

    bridge.navigation.push("/asset-tracker/assets")
    await flush()
    expect(entriesOf(bridge)?.[1]).toEqual({
      key: "/assets",
      label: "Assets",
      href: "/asset-tracker/assets",
      state: "ready",
      kind: "route",
      hidden: undefined,
    })

    bridge.navigation.push("/asset-tracker/assets/42")
    await flush()
    const pending = entriesOf(bridge)?.find((entry) => entry.key === "/assets/$assetId")
    if (pending) expect(pending.state).toBe("loading")
    resolveAsset({ title: "Pump 42" })
    await flush()
    expect(entriesOf(bridge)?.at(-1)).toEqual({
      key: "/assets/$assetId",
      label: "Pump 42",
      href: "/asset-tracker/assets/42",
      state: "ready",
      kind: "route",
      hidden: undefined,
    })

    bridge.navigation.push("/asset-tracker/dynamic/7")
    await flush()
    expect(entriesOf(bridge)?.at(-1)).toMatchObject({
      label: "Item 7",
      href: "/asset-tracker/dynamic/7",
      state: "ready",
    })

    bridge.navigation.push("/asset-tracker/broken")
    await flush()
    expect(entriesOf(bridge)?.at(-1)).toMatchObject({
      key: "/broken",
      label: undefined,
      state: "unavailable",
    })

    bridge.navigation.push("/asset-tracker/from-loader")
    await flush()
    expect(entriesOf(bridge)?.at(-1)).toMatchObject({
      key: "/from-loader",
      label: "From loader",
      state: "ready",
    })

    await disposeAsync(handle)
    expect(bridge.breadcrumbs.getState().trails[bridge.instanceId]).toBeUndefined()
    container.remove()
  })

  it("lets a route override its entry with useBreadcrumb", async () => {
    const definition = build()
    const bridge = bridgeFor({ mfeId: "asset-tracker", initialPath: "/asset-tracker/override" })
    const { handle, container } = await mountMfe(definition, bridge)
    expect(entriesOf(bridge)?.at(-1)).toMatchObject({ key: "/override", label: "Draft" })
    container.querySelector("button")!.click()
    await flush()
    expect(entriesOf(bridge)?.at(-1)).toMatchObject({ key: "/override", label: "Final" })
    bridge.navigation.push("/asset-tracker/assets")
    await flush()
    expect(entriesOf(bridge)?.at(-1)).toMatchObject({ key: "/assets", label: "Assets" })
    await disposeAsync(handle)
    container.remove()
  })

  it("falls back to the display name for the root entry", async () => {
    const { routeTree } = routeTreeOf([{ path: "/", component: () => <p>home</p> }])
    const definition = createMfe({ mfeId: "reports", displayName: "Reports", routeTree })
    const bridge = bridgeFor({ mfeId: "reports" })
    const { handle, container } = await mountMfe(definition, bridge)
    expect(entriesOf(bridge)).toEqual([
      {
        key: "__root__",
        label: "Reports",
        href: "/reports",
        state: "ready",
        kind: "mfe-root",
        hidden: undefined,
      },
    ])
    await disposeAsync(handle)
    container.remove()
  })
})

describe("buildBreadcrumbTrail", () => {
  it("marks pending matches as loading and errored matches as unavailable", async () => {
    const { buildBreadcrumbTrail } = await import("../src/breadcrumbs")
    const { createMountScope } = await import("../src/scope")
    const bridge = bridgeFor({ mfeId: "asset-tracker" })
    const scope = createMountScope({
      bridge,
      kind: "mfe",
      rootElement: null,
      displayName: "Assets",
    })
    const match = (overrides: Record<string, unknown>) =>
      ({
        routeId: "/assets/$assetId",
        pathname: "/assets/1",
        params: { assetId: "1" },
        search: {},
        status: "success",
        staticData: { breadcrumb: { fromLoader: "title" } },
        ...overrides,
      }) as never
    const trail = (overrides: Record<string, unknown>) =>
      buildBreadcrumbTrail(
        scope,
        [match(overrides)],
        () => "/asset-tracker/assets/1",
        new Map()
      ).entries.at(-1)
    expect(trail({ status: "pending" })).toMatchObject({
      state: "loading",
      href: "/asset-tracker/assets/1",
    })
    expect(trail({ status: "error", error: new Error("x") })).toMatchObject({
      state: "unavailable",
    })
    expect(trail({ loaderData: { title: "Pump" } })).toMatchObject({
      state: "ready",
      label: "Pump",
    })
    expect(trail({ loaderData: {} })).toMatchObject({ state: "unavailable", label: undefined })
    expect(
      trail({ staticData: { breadcrumb: { label: "Static", hidden: true } } })
    ).toMatchObject({ state: "ready", label: "Static", hidden: true })
    expect(
      buildBreadcrumbTrail(scope, [], () => undefined, new Map()).entries[0]
    ).toMatchObject({ kind: "mfe-root", label: "Assets", href: "/asset-tracker" })
    scope.disposer.dispose()
  })
})
