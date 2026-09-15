import { createElement, useSyncExternalStore, type ComponentType } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { MountableSurface } from "@platform-internal/core"
import { MfeErrorBoundary } from "./boundary"
import { applyEnhancers, PlatformProvider } from "./provider"
import { createSurfaceScope, type MountScope } from "./scope"
import type { SettingsController, SettingsRenderer, SettingsRendererSurface } from "./types"

/**
 * Surfaces are how MFE React components reach shell-rendered places (settings
 * host, help panel, release notes): the SDK converts a component into
 * `mount(container) → { dispose }`, rendering it with this MFE's own React
 * into a root the host provides. Nothing React crosses the boundary.
 */
export function isMountableSurface(value: unknown): value is MountableSurface {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as MountableSurface).mount === "function"
  )
}

export function isSettingsRendererSurface(value: unknown): value is SettingsRendererSurface {
  return (
    isMountableSurface(value) &&
    (value as { kind?: unknown }).kind === "platform-settings-renderer"
  )
}

function createSurfaceElement(
  scope: MountScope,
  container: HTMLElement,
  kind: string
): HTMLElement {
  const element = container.ownerDocument.createElement("div")
  element.setAttribute("data-mfe", scope.instance.mfeId)
  element.setAttribute("data-platform-instance", scope.instance.instanceId)
  if (scope.instance.widgetId)
    element.setAttribute("data-platform-widget", scope.instance.widgetId)
  element.setAttribute("data-platform-surface", kind)
  container.append(element)
  return element
}

interface SurfaceRoot {
  root: Root
  scope: MountScope
  element: HTMLElement
  render(node: React.ReactNode): void
  dispose(): void
}

function mountSurfaceRoot(
  parent: MountScope,
  container: HTMLElement,
  kind: string
): SurfaceRoot {
  const element = createSurfaceElement(parent, container, kind)
  const scope = createSurfaceScope(parent, element)
  const root = createRoot(element)
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    root.unmount()
    scope.disposer.dispose()
    element.remove()
  }
  const removeFromParent = parent.disposer.add(dispose)
  return {
    root,
    scope,
    element,
    render(node) {
      if (disposed) return
      root.render(
        <PlatformProvider scope={scope}>
          <MfeErrorBoundary name={`surface:${kind}`}>
            {applyEnhancers(node, scope)}
          </MfeErrorBoundary>
        </PlatformProvider>
      )
    },
    dispose() {
      removeFromParent()
      dispose()
    },
  }
}

/** Convert a component (read lazily so the latest one is used) into a `MountableSurface`. */
export function createSurface<TProps extends object>(
  scope: MountScope,
  getComponent: () => ComponentType<TProps>,
  getProps: () => TProps = () => ({}) as TProps,
  kind = "content"
): MountableSurface {
  return {
    mount(container) {
      const surface = mountSurfaceRoot(scope, container, kind)
      surface.render(createElement(getComponent(), getProps()))
      return { dispose: () => surface.dispose() }
    },
  }
}

/** Accept a component or an existing surface. */
export function toMountableSurface(
  scope: MountScope,
  value: ComponentType | MountableSurface | undefined,
  kind: string
): MountableSurface | undefined {
  if (value === undefined) return undefined
  if (isMountableSurface(value)) return value
  return createSurface(scope, () => value, undefined, kind)
}

interface ControllerStore<TValue> {
  get(): SettingsController<TValue>
  set(next: SettingsController<TValue>): void
  subscribe(listener: () => void): () => void
}

function createControllerStore<TValue>(
  initial: SettingsController<TValue>
): ControllerStore<TValue> {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    get: () => current,
    set(next) {
      current = next
      for (const listener of Array.from(listeners)) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

function ControllerBridge<TValue>({
  store,
  getRenderer,
}: {
  store: ControllerStore<TValue>
  getRenderer: () => SettingsRenderer<TValue>
}) {
  const controller = useSyncExternalStore(store.subscribe, store.get, store.get)
  return createElement(getRenderer(), { controller })
}

/**
 * Convert a settings renderer component into the surface the host calls:
 * `mount(container, controller) → { update(controller), dispose() }`.
 */
export function createSettingsRendererSurface<TValue>(
  scope: MountScope,
  getRenderer: () => SettingsRenderer<TValue>
): SettingsRendererSurface<TValue> {
  return {
    kind: "platform-settings-renderer",
    mount(container, controller) {
      const store = createControllerStore(controller)
      const surface = mountSurfaceRoot(scope, container, "settings-renderer")
      surface.render(<ControllerBridge store={store} getRenderer={getRenderer} />)
      return {
        update: (next) => store.set(next),
        dispose: () => surface.dispose(),
      }
    },
  }
}
