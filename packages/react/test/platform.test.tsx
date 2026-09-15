import { describe, expect, it } from "vitest"
import { act, render, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import {
  useCapability,
  useMfeInstance,
  useNavigation,
  useNotifications,
  usePermissions,
  usePlatform,
  useRuntimeEnv,
  useTelemetry,
} from "../src/hooks/context"
import { PlatformTestProvider } from "../src/testing"
import { bridgeFor } from "./helpers"

describe("usePlatform", () => {
  it("throws a clear PlatformError outside a platform mount", () => {
    expect(() => renderHook(() => usePlatform())).toThrowError(
      expect.objectContaining({ code: "INTERNAL", message: expect.stringContaining("usePlatform()") })
    )
  })

  it("returns the full context and updates on change", () => {
    const bridge = bridgeFor({ mfeId: "a", permissionGroups: ["x"], env: { API: "1" } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <PlatformTestProvider bridge={bridge}>{children}</PlatformTestProvider>
    )
    const { result } = renderHook(() => usePlatform(), { wrapper })
    expect(result.current.user?.displayName).toBe("Test User")
    expect(result.current.permissions.hasGroup("x")).toBe(true)
    expect(result.current.navigation.routePrefix).toBe("/a")
    expect(result.current.telemetry).toBe(bridge.telemetry)
    expect(result.current.runtime.env).toEqual({ API: "1" })
    act(() => bridge.setContext({ theme: "dark" }))
    expect(result.current.theme).toBe("dark")
    expect(result.current.revision).toBe(1)
  })

  it("does not rerender a component subscribed to a slice when unrelated context changes", () => {
    const bridge = bridgeFor({ mfeId: "a" })
    let renders = 0
    const Name = () => {
      renders += 1
      const name = usePlatform((platform) => platform.user?.displayName)
      return <span data-testid="name">{name}</span>
    }
    const view = render(
      <PlatformTestProvider bridge={bridge}>
        <Name />
      </PlatformTestProvider>
    )
    expect(renders).toBe(1)
    act(() => bridge.setContext({ theme: "dark" }))
    act(() => bridge.setContext({ job: { id: "job-1" } }))
    expect(renders).toBe(1)
    act(() => bridge.setContext({ user: { id: "1", displayName: "Renamed" } }))
    expect(renders).toBe(2)
    expect(view.getByTestId("name").textContent).toBe("Renamed")
  })

  it("keeps object slices referentially stable when shallow-equal", () => {
    const bridge = bridgeFor({ mfeId: "a" })
    let renders = 0
    const Slice = () => {
      renders += 1
      const slice = usePlatform((platform) => ({ locale: platform.locale, tz: platform.timezone }))
      return <span>{slice.locale}</span>
    }
    render(
      <PlatformTestProvider bridge={bridge}>
        <Slice />
      </PlatformTestProvider>
    )
    act(() => bridge.setContext({ theme: "dark" }))
    expect(renders).toBe(1)
    act(() => bridge.setContext({ locale: "de-DE" }))
    expect(renders).toBe(2)
  })
})

describe("other hooks", () => {
  const bridge = bridgeFor({
    mfeId: "a",
    permissionGroups: ["g1", "g2"],
    capabilities: ["commands"],
    notifications: false,
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <PlatformTestProvider bridge={bridge}>{children}</PlatformTestProvider>
  )

  it("useCapability / usePermissions / useRuntimeEnv / useMfeInstance", () => {
    expect(renderHook(() => useCapability("commands"), { wrapper }).result.current).toBe(true)
    expect(renderHook(() => useCapability("settings"), { wrapper }).result.current).toBe(false)
    const permissions = renderHook(() => usePermissions(), { wrapper }).result.current
    expect(permissions.groups).toEqual(["g1", "g2"])
    expect(permissions.hasAllGroups(["g1", "g2"])).toBe(true)
    expect(permissions.hasAnyGroup(["nope"])).toBe(false)
    expect(renderHook(() => useRuntimeEnv(), { wrapper }).result.current).toEqual({})
    const instance = renderHook(() => useMfeInstance(), { wrapper }).result.current
    expect(instance).toMatchObject({ mfeId: "a", instanceId: bridge.instanceId, routePrefix: "/a" })
  })

  it("useNavigation delegates to the shell and tracks the location", () => {
    const { result } = renderHook(() => useNavigation(), { wrapper })
    expect(result.current.location.pathname).toBe("/a")
    act(() => result.current.navigateWithin("/assets/1"))
    expect(result.current.location.pathname).toBe("/a/assets/1")
    act(() => result.current.navigate({ to: "/a/assets", search: { page: 2 }, hash: "top" }))
    expect(result.current.location).toMatchObject({ pathname: "/a/assets", search: "?page=2", hash: "#top" })
    act(() => result.current.back())
    expect(result.current.location.pathname).toBe("/a/assets/1")
    act(() => result.current.navigate("/a", { replace: true }))
    expect(result.current.location.pathname).toBe("/a")
    expect(result.current.location.pathname).toBe(bridge.navigation.getLocation().pathname)
  })

  it("useTelemetry enriches with route and useNotifications falls back with a diagnostic", () => {
    const telemetry = renderHook(() => useTelemetry(), { wrapper }).result.current
    telemetry.track("hello")
    expect(bridge.telemetryEvents.at(-1)).toMatchObject({
      name: "hello",
      attributes: { mfeId: "a", route: "/a" },
    })
    const notifications = renderHook(() => useNotifications(), { wrapper }).result.current
    notifications.notify({ title: "hi" })
    expect(bridge.diagnostics.events.at(-1)).toMatchObject({ type: "log", level: "warn" })
  })
})
