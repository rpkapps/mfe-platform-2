import { describe, expect, it, vi } from "vitest"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"

import { createTestHost, fakeLoader, recordingFetch as fakeFetch } from "@platform/host/testing"

import { createTanStackShellNavigation, mfeRouteHelpers } from "../src/tanstack"

function makeRouter(initial = "/") {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" })
  const catchAll = createRoute({ getParentRoute: () => rootRoute, path: "$" })
  const history = createMemoryHistory({ initialEntries: [initial] })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, catchAll]),
    history,
  })
  return { router, history }
}

describe("createTanStackShellNavigation", () => {
  it("propagates push/replace/back through the router history without touching window.history", async () => {
    const pushState = vi.spyOn(window.history, "pushState")
    const replaceState = vi.spyOn(window.history, "replaceState")
    const originalPush = window.history.pushState
    const { router, history } = makeRouter("/")
    await router.load()
    const navigation = createTanStackShellNavigation(router)
    const seen: [string, string][] = []
    const unsubscribe = navigation.subscribe((location, action) =>
      seen.push([action, `${location.pathname}${location.search}`])
    )
    expect(navigation.getLocation().pathname).toBe("/")
    navigation.push("/asset-tracker/assets/1?tab=x")
    await vi.waitFor(() => expect(history.location.pathname).toBe("/asset-tracker/assets/1"))
    expect(history.location.search).toBe("?tab=x")
    navigation.replace("/asset-tracker/assets/2")
    await vi.waitFor(() => expect(history.location.pathname).toBe("/asset-tracker/assets/2"))
    expect(history.length).toBe(2)
    navigation.back()
    await vi.waitFor(() => expect(history.location.pathname).toBe("/"))
    navigation.forward()
    await vi.waitFor(() => expect(history.location.pathname).toBe("/asset-tracker/assets/2"))
    expect(seen.map(([action]) => action)).toEqual(["push", "replace", "pop", "pop"])
    expect(seen[0]?.[1]).toBe("/asset-tracker/assets/1?tab=x")
    expect(navigation.getLocation().pathname).toBe("/asset-tracker/assets/2")
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
    expect(window.history.pushState).toBe(originalPush)
    unsubscribe()
    navigation.dispose()
    pushState.mockRestore()
    replaceState.mockRestore()
  })

  it("matches MFEs for the catch-all route by longest prefix", () => {
    const host = createTestHost({
      fetch: fakeFetch({}),
      loader: fakeLoader({}),
      registry: [
        { mfeId: "asset-tracker" },
        { mfeId: "asset-tracker-admin", routePrefix: "/asset-tracker/admin" },
      ],
    })
    const helpers = mfeRouteHelpers({ host })
    expect(helpers.matchMfeForPath("/asset-tracker/admin/users")).toEqual({
      mfeId: "asset-tracker-admin",
      routePrefix: "/asset-tracker/admin",
    })
    expect(helpers.matchMfeForPath("/asset-tracker/assets")).toEqual({
      mfeId: "asset-tracker",
      routePrefix: "/asset-tracker",
    })
    expect(helpers.matchMfeForPath("/other")).toBeNull()
    expect(helpers.routePrefixes()[0]?.routePrefix).toBe("/asset-tracker/admin")
  })
})
