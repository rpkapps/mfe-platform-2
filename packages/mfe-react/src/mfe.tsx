import { createElement, version as reactVersion, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { RouterProvider, type AnyRouter } from "@tanstack/react-router"
import {
  assertMfeId,
  formatIssues,
  isRemoteDefinition,
  PLATFORM_PROTOCOL_VERSION,
  PlatformError,
  toPlatformError,
  validateSync,
  type HostBridge,
  type MountHandle,
  type MountOptions,
  type WidgetHandle,
  type WidgetMountOptions,
} from "@platform-internal/core"
import { MfeErrorBoundary } from "./boundary"
import { applyEnhancers, PlatformProvider } from "./provider"
import { createMfeRouter } from "./router"
import { createMountScope, type MountScope } from "./scope"
import type {
  CreateMfeOptions,
  MfeDefinition,
  MfeEnhancer,
  MfeEnhancerContext,
  MountKind,
  WidgetDefinition,
} from "./types"

export { isRemoteDefinition }

/** Declare a widget; `id` defaults to the key when passed in a record to `createMfe`. */
export function createWidget<TProps extends Record<string, unknown> = Record<string, unknown>>(
  definition: WidgetDefinition<TProps>
): WidgetDefinition<TProps> {
  return definition
}

function resolveMfeId(explicit: string | undefined): string {
  const injected = typeof __PLATFORM_MFE_ID__ !== "undefined" ? __PLATFORM_MFE_ID__ : undefined
  const mfeId = explicit ?? injected
  if (!mfeId) {
    throw new PlatformError({
      code: "MFE_ID_INVALID",
      message:
        "createMfe() needs an mfeId: pass `mfeId` or build with @platform/vite, which injects it.",
      override: "createMfe({ mfeId })",
    })
  }
  return assertMfeId(mfeId, "createMfe")
}

function collectWidgets(
  widgets: CreateMfeOptions["widgets"]
): Map<string, WidgetDefinition<any>> {
  const map = new Map<string, WidgetDefinition<any>>()
  if (!widgets) return map
  const entries = Array.isArray(widgets)
    ? widgets.map((widget) => [widget.id, widget] as const)
    : Object.entries(widgets).map(([key, widget]) => [widget.id ?? key, widget] as const)
  for (const [id, widget] of entries) {
    if (!id) {
      throw new PlatformError({
        code: "WIDGET_UNKNOWN",
        message: "A widget passed as an array to createMfe({ widgets }) needs an `id`.",
      })
    }
    map.set(id, { ...widget, id })
  }
  return map
}

function describeContainer(container: HTMLElement): string {
  const id = container.id ? `#${container.id}` : ""
  const slot = container.getAttribute("data-platform-slot")
  return `${container.tagName.toLowerCase()}${id}${slot ? `[data-platform-slot="${slot}"]` : ""}`
}

function createRootElement(
  container: HTMLElement,
  bridge: HostBridge,
  widgetId?: string
): HTMLElement {
  const element = container.ownerDocument.createElement("div")
  element.setAttribute("data-mfe", bridge.mfeId)
  element.setAttribute("data-platform-instance", bridge.instanceId)
  element.setAttribute("data-platform-root", "")
  if (widgetId) element.setAttribute("data-platform-widget", widgetId)
  container.append(element)
  return element
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now())

interface IsolatedRoot {
  scope: MountScope
  element: HTMLElement
  root: Root
  render(children: ReactNode): void
}

function createIsolatedRoot(
  options: MountOptions,
  kind: MountKind,
  enhancers: readonly MfeEnhancer[],
  displayName: string | undefined,
  wrap: CreateMfeOptions["wrap"],
  widgetId?: string
): IsolatedRoot {
  const element = createRootElement(options.container, options.bridge, widgetId)
  const scope = createMountScope({
    bridge: options.bridge,
    kind,
    rootElement: element,
    displayName,
    enhancers,
    widgetId,
  })
  scope.disposer.add(() => element.remove())
  const root = createRoot(element)
  scope.disposer.add(() => root.unmount())
  const wrapContext: MfeEnhancerContext = {
    bridge: scope.bridge,
    instance: scope.instance,
    kind,
    rootElement: element,
    disposer: scope.disposer,
    cache: scope.cache,
  }
  return {
    scope,
    element,
    root,
    render(children) {
      const enhanced = applyEnhancers(children, scope)
      root.render(
        <PlatformProvider scope={scope}>
          <MfeErrorBoundary name={kind}>
            {wrap ? wrap(enhanced, wrapContext) : enhanced}
          </MfeErrorBoundary>
        </PlatformProvider>
      )
    },
  }
}

/**
 * Define the remote the host loads: `export default createMfe({...})`. The
 * definition is plain data plus `mount` / `mountWidget`; the host never sees
 * React values.
 */
export function createMfe(options: CreateMfeOptions = {}): MfeDefinition {
  const mfeId = resolveMfeId(options.mfeId)
  const widgetDefinitions = collectWidgets(options.widgets)
  const enhancers: MfeEnhancer[] = []
  const displayName = options.displayName

  const mount = (mountOptions: MountOptions): MountHandle => {
    const { bridge } = mountOptions
    const owner = { mfeId: bridge.mfeId, instanceId: bridge.instanceId }
    const startedAt = now()
    bridge.diagnostics.emit({
      type: "mount.started",
      container: describeContainer(mountOptions.container),
      ...owner,
    })
    const span = bridge.telemetry.span("mount", { kind: "mfe" })
    let isolated: IsolatedRoot | null = null
    try {
      if (!options.routeTree) {
        throw new PlatformError({
          code: "MOUNT_FAILED",
          message: `MFE "${mfeId}" has no route tree; it only exposes widgets.`,
          owner,
          override: "createMfe({ routeTree })",
        })
      }
      isolated = createIsolatedRoot(mountOptions, "mfe", enhancers, displayName, options.wrap)
      const { scope } = isolated
      const router: AnyRouter = createMfeRouter({
        ...(options.router ?? {}),
        ...(options.errorComponent ? { defaultErrorComponent: options.errorComponent } : {}),
        ...(options.pendingComponent
          ? { defaultPendingComponent: options.pendingComponent }
          : {}),
        ...(options.notFoundComponent
          ? { defaultNotFoundComponent: options.notFoundComponent }
          : {}),
        routeTree: options.routeTree,
        bridge,
        scope,
      })
      scope.disposer.add(() => {
        bridge.registries.commands.clearOwner(bridge.instanceId)
        bridge.registries.settings.clearOwner(bridge.instanceId)
        bridge.registries.help.clearOwner(bridge.instanceId)
        bridge.registries.releaseNotes.clearOwner(bridge.instanceId)
        bridge.breadcrumbs.clear(bridge.instanceId)
      })
      isolated.render(<RouterProvider router={router as never} />)
      // Headless mounts (the host renders nothing visible, e.g. to activate root-level
      // registrations) keep everything but the breadcrumb bar.
      if (!bridge.host.headless) bridge.breadcrumbs.setActive(bridge.instanceId)
      // No `routerVersion`: the remote cannot read the router's version at
      // runtime, and a package name in a version field is worse than nothing.
      // The host resolves the real one from the shared report and the manifest.
      bridge.diagnostics.emit({
        type: "mount.completed",
        durationMs: Math.round(now() - startedAt),
        reactVersion,
        ...owner,
      })
      span.end({ reactVersion })
      let disposed = false
      return {
        dispose() {
          if (disposed) return
          disposed = true
          bridge.diagnostics.emit({ type: "unmount", reason: "dispose", ...owner })
          scope.disposer.dispose()
        },
        update() {
          void router.invalidate()
        },
      }
    } catch (error) {
      isolated?.scope.disposer.dispose()
      const platformError = toPlatformError(error, { code: "MOUNT_FAILED", owner })
      bridge.telemetry.error(platformError, { boundary: "mount" })
      bridge.diagnostics.emit({
        type: "mount.failed",
        error: platformError.toJSON(),
        errorInstance: platformError,
        ...owner,
      })
      span.fail(platformError)
      throw platformError
    }
  }

  const mountWidget = (widgetOptions: WidgetMountOptions): WidgetHandle => {
    const { bridge, widgetId } = widgetOptions
    const owner = { mfeId: bridge.mfeId, instanceId: bridge.instanceId, widgetId }
    const widget = widgetDefinitions.get(widgetId)
    if (!widget) {
      throw new PlatformError({
        code: "WIDGET_UNKNOWN",
        message: `MFE "${mfeId}" exposes no widget "${widgetId}".`,
        owner,
        source: widgetId,
      })
    }
    const validate = (props: Record<string, unknown>): Record<string, unknown> => {
      if (!widget.propsSchema) return props
      const result = validateSync(widget.propsSchema, props)
      if (!result.ok) {
        throw new PlatformError({
          code: "WIDGET_MOUNT_FAILED",
          message: `Props of widget "${widgetId}" are invalid: ${formatIssues(result.issues)}`,
          owner,
          source: widgetId,
          details: { issues: result.issues },
        })
      }
      return result.value as Record<string, unknown>
    }
    const span = bridge.telemetry.span("mount", { kind: "widget", widgetId })
    let isolated: IsolatedRoot | null = null
    try {
      const initial = validate(widgetOptions.props ?? {})
      isolated = createIsolatedRoot(
        widgetOptions,
        "widget",
        enhancers,
        displayName,
        options.wrap,
        widgetId
      )
      const { scope } = isolated
      scope.disposer.add(() => {
        bridge.registries.commands.clearOwner(bridge.instanceId)
        bridge.registries.settings.clearOwner(bridge.instanceId)
        bridge.registries.help.clearOwner(bridge.instanceId)
        bridge.registries.releaseNotes.clearOwner(bridge.instanceId)
      })
      const render = (props: Record<string, unknown>) =>
        isolated!.render(createElement(widget.component, props))
      render(initial)
      bridge.diagnostics.emit({
        type: "widget.mounted",
        slot: widgetOptions.container.getAttribute("data-platform-slot") ?? undefined,
        ...owner,
      })
      span.end({ reactVersion })
      let disposed = false
      return {
        dispose() {
          if (disposed) return
          disposed = true
          bridge.diagnostics.emit({ type: "widget.unmounted", ...owner })
          scope.disposer.dispose()
        },
        setProps(props) {
          if (disposed) return
          render(validate(props))
        },
      }
    } catch (error) {
      isolated?.scope.disposer.dispose()
      const platformError = toPlatformError(error, { code: "WIDGET_MOUNT_FAILED", owner })
      bridge.telemetry.error(platformError, { boundary: "widget-mount", widgetId })
      bridge.diagnostics.emit({
        type: "widget.failed",
        error: platformError.toJSON(),
        errorInstance: platformError,
        ...owner,
      })
      span.fail(platformError)
      throw platformError
    }
  }

  const definition: MfeDefinition = {
    kind: "platform-remote",
    protocolVersion: PLATFORM_PROTOCOL_VERSION,
    mfeId,
    displayName,
    widgets: Array.from(widgetDefinitions.values()).map((widget) => ({
      id: widget.id!,
      title: widget.title,
      description: widget.description,
    })),
    hasRoutes: options.routeTree !== undefined,
    registrations: options.registrations,
    routeTree: options.routeTree,
    widgetDefinitions,
    enhancers,
    options,
    mount,
    mountWidget,
    use(enhancer) {
      if (!enhancers.some((existing) => existing.name === enhancer.name))
        enhancers.push(enhancer)
      return definition
    },
  }
  return definition
}
