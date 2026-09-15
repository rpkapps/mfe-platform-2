import { afterEach, describe, expect, it, vi } from "vitest"
import { createMemoryNavigation } from "@platform-internal/core"
import { createShellHistory } from "../src/history"

describe("createShellHistory", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("pushes, replaces and moves through the shell navigation", () => {
    const navigation = createMemoryNavigation("/asset-tracker")
    const history = createShellHistory(navigation)
    const seen: string[] = []
    history.subscribe(({ location, action }) =>
      seen.push(`${action.type}:${location.pathname}`)
    )

    history.push("/asset-tracker/assets")
    expect(navigation.getLocation().pathname).toBe("/asset-tracker/assets")
    expect(history.location.pathname).toBe("/asset-tracker/assets")
    expect(history.location.state.__TSR_index).toBe(1)

    history.replace("/asset-tracker/assets?page=2")
    expect(navigation.getLocation().search).toBe("?page=2")
    expect(history.location.state.__TSR_index).toBe(1)

    history.back()
    expect(navigation.getLocation().pathname).toBe("/asset-tracker")
    expect(history.location.pathname).toBe("/asset-tracker")
    expect(history.canGoBack()).toBe(false)

    history.forward()
    expect(history.location.search).toBe("?page=2")

    // One notification per navigation: the shell echo of our own push is ignored.
    expect(seen).toEqual([
      "PUSH:/asset-tracker/assets",
      "REPLACE:/asset-tracker/assets",
      "BACK:/asset-tracker",
      "FORWARD:/asset-tracker/assets",
    ])
  })

  it("forwards shell-initiated navigations (popstate, shell pushes) to the router", () => {
    const navigation = createMemoryNavigation("/a")
    const history = createShellHistory(navigation)
    const seen: string[] = []
    history.subscribe(({ location, action }) =>
      seen.push(`${action.type}:${location.pathname}`)
    )
    navigation.push("/b")
    navigation.push("/c")
    navigation.go(-2)
    expect(seen).toEqual(["PUSH:/b", "PUSH:/c", "GO:/a"])
    history.dispose()
    navigation.push("/d")
    expect(seen).toHaveLength(3)
  })

  it("never patches the History API nor listens to popstate", () => {
    const pushState = window.history.pushState
    const replaceState = window.history.replaceState
    const addEventListener = vi.spyOn(window, "addEventListener")
    const navigation = createMemoryNavigation("/x")
    const history = createShellHistory(navigation)
    history.push("/y")
    history.back()
    expect(window.history.pushState).toBe(pushState)
    expect(window.history.replaceState).toBe(replaceState)
    expect(addEventListener.mock.calls.map(([type]) => type)).not.toContain("popstate")
    expect(addEventListener.mock.calls.map(([type]) => type)).not.toContain("beforeunload")
    expect(window.location.pathname).not.toBe("/y")
  })

  it("respects canLeave and blockers", () => {
    const navigation = createMemoryNavigation("/a")
    ;(navigation as { canLeave?: (next: string) => boolean }).canLeave = (next) =>
      next !== "/blocked"
    const history = createShellHistory(navigation)
    history.push("/blocked")
    expect(navigation.getLocation().pathname).toBe("/a")
    history.push("/ok")
    expect(navigation.getLocation().pathname).toBe("/ok")
  })
})

describe("createShellHistory outside the MFE prefix", () => {
  it("shows an inactive location and drops the router's own navigations", () => {
    const navigation = createMemoryNavigation("/settings")
    const history = createShellHistory(navigation, { prefix: "/legacy/reports" })
    expect(history.location.pathname).toBe("/legacy/reports/__platform_inactive__")
    // The router normalising its location must not rewrite the shell URL.
    history.replace("/legacy/reports/settings")
    history.push("/legacy/reports/reports/x")
    expect(navigation.getLocation().pathname).toBe("/settings")
    // Once the shell enters the prefix the real location is visible and navigation works.
    navigation.push("/legacy/reports/reports/daily")
    expect(history.location.pathname).toBe("/legacy/reports/reports/daily")
    history.push("/legacy/reports")
    expect(navigation.getLocation().pathname).toBe("/legacy/reports")
    history.dispose()
  })
})
