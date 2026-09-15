import { useMemo } from "react"
import {
  shallowEqual,
  type CapabilityId,
  type Disposer,
  type Equality,
  type NotificationPort,
  type PermissionHelpers,
  type ShellLocation,
  type Telemetry,
} from "@platform-internal/core"
import { useMountScope } from "../provider"
import { ensureOverlayRoot } from "../scope"
import type {
  MfeInstance,
  PlatformContextValue,
  PlatformNavigation,
  RegisteredEnv,
} from "../types"
import { useStoreSlice } from "./store"

/**
 * The platform context of this mount. With a selector the component only
 * rerenders when the selected slice changes (`equals`, shallow by default).
 */
export function usePlatform(): PlatformContextValue
export function usePlatform<TSlice>(
  selector: (platform: PlatformContextValue) => TSlice,
  equals?: Equality<TSlice>
): TSlice
export function usePlatform<TSlice>(
  selector?: (platform: PlatformContextValue) => TSlice,
  equals: Equality<TSlice> = shallowEqual
): TSlice | PlatformContextValue {
  const scope = useMountScope("usePlatform")
  return useStoreSlice(scope.contextStore, selector, equals)
}

/** Whether the host approved a capability for this MFE. */
export function useCapability(id: CapabilityId): boolean {
  const scope = useMountScope("useCapability")
  return useStoreSlice(scope.contextStore, (platform) => platform.capabilities.includes(id))
}

export interface PermissionsValue extends PermissionHelpers {
  groups: string[]
}

/** Permission groups visible to the browser and helpers. Backend authorization still applies. */
export function usePermissions(): PermissionsValue {
  const scope = useMountScope("usePermissions")
  const groups = useStoreSlice(scope.contextStore, (platform) => platform.permissionGroups)
  const helpers = useStoreSlice(
    scope.contextStore,
    (platform) => platform.permissions,
    Object.is
  )
  return useMemo(() => ({ groups, ...helpers }), [groups, helpers])
}

/** Allow-listed runtime environment values, typed through `Register.env`. */
export function useRuntimeEnv(): RegisteredEnv {
  const scope = useMountScope("useRuntimeEnv")
  return useStoreSlice(scope.contextStore, (platform) => platform.runtime.env, Object.is)
}

/** Identity of this mount. */
export function useMfeInstance(): MfeInstance {
  return useMountScope("useMfeInstance").instance
}

export interface NavigationValue extends PlatformNavigation {
  /** Current shell location (subscribed). */
  readonly location: ShellLocation
}

/** Navigation through the shell-owned history, with the current location subscribed. */
export function useNavigation(): NavigationValue {
  const scope = useMountScope("useNavigation")
  const navigation = scope.navigation
  const locationStore = useMemo(
    () => ({
      getState: () => scope.bridge.navigation.getLocation(),
      subscribe: (listener: () => void) => scope.bridge.navigation.subscribe(() => listener()),
    }),
    [scope]
  )
  const location = useStoreSlice(locationStore, undefined, Object.is)
  return useMemo(
    () => ({
      routePrefix: navigation.routePrefix,
      navigate: navigation.navigate,
      navigateWithin: navigation.navigateWithin,
      back: navigation.back,
      forward: navigation.forward,
      reload: navigation.reload,
      subscribe: navigation.subscribe,
      location,
    }),
    [navigation, location]
  )
}

/** Telemetry enriched with the current route and widget. */
export function useTelemetry(): Telemetry {
  const scope = useMountScope("useTelemetry")
  const pathname = useStoreSlice(
    useMemo(
      () => ({
        getState: () => scope.bridge.navigation.getLocation().pathname,
        subscribe: (listener: () => void) =>
          scope.bridge.navigation.subscribe(() => listener()),
      }),
      [scope]
    ),
    undefined,
    Object.is
  )
  return useMemo(
    () =>
      scope.bridge.telemetry.child({
        route: pathname,
        widgetId: scope.instance.widgetId,
      }),
    [scope, pathname]
  )
}

/** Toasts through the shell notification host; a no-op (with a diagnostic) when the host has none. */
export function useNotifications(): NotificationPort {
  const scope = useMountScope("useNotifications")
  return useMemo<NotificationPort>(() => {
    const port = scope.bridge.notifications
    if (port) return port
    return {
      notify(notification) {
        scope.bridge.diagnostics.emit({
          type: "log",
          level: "warn",
          message: `Notification dropped: the host provides no notification port (${notification.title}).`,
          mfeId: scope.instance.mfeId,
          instanceId: scope.instance.instanceId,
          widgetId: scope.instance.widgetId,
        })
      },
    }
  }, [scope])
}

/**
 * The per-mount overlay root managed by the shell overlay manager (created
 * lazily, once per mount, disposed with it, `dark` class synced with the
 * resolved theme). Portal modals into it so they take part in the global
 * modal ordering: `createPortal(<Modal/>, useOverlayContainer())`.
 */
export function useOverlayContainer(): HTMLElement {
  const scope = useMountScope("useOverlayContainer")
  return ensureOverlayRoot(scope).element
}

/**
 * The disposer of this mount: `add(cleanup)` runs the cleanup when the MFE,
 * widget or surface root is disposed (not when the calling component
 * unmounts) and returns a function removing it again.
 */
export function useMountDisposer(): Disposer {
  return useMountScope("useMountDisposer").disposer
}
