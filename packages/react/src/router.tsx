import { createElement, Fragment, type ReactNode } from "react"
import { createRouter, type AnyRoute, type AnyRouter } from "@tanstack/react-router"
import { createDisposer, type Disposer, type HostBridge } from "@platform-internal/core"
import { BreadcrumbPublisher } from "./breadcrumbs"
import {
  DefaultNotFoundComponent,
  DefaultPendingComponent,
  DefaultRouteErrorComponent,
} from "./boundary"
import { createShellHistory, normalizeShellHref, type ShellHistory } from "./history"
import { createMountScope, type MountScope } from "./scope"
import type { MfeRouterContext } from "./types"

const GLOBAL_ROUTER_KEY = "__TSR_ROUTER__"
/** Live MFE routers by `mfeId`: the route-level HMR glue of a remote (rewritten by `@platform/vite`) looks here. */
const ROUTER_REGISTRY_KEY = "__PLATFORM_TSR_ROUTERS__"
type GlobalRouterScope = Record<typeof GLOBAL_ROUTER_KEY, unknown> &
  Record<typeof ROUTER_REGISTRY_KEY, Record<string, AnyRouter> | undefined>
const routerOwners = new WeakMap<AnyRouter, string>()

export interface CreateMfeRouterOptions extends Record<string, unknown> {
  routeTree: AnyRoute
  bridge: HostBridge
  /** The mount scope (created by `createMfe`); one is derived from the bridge when omitted. */
  scope?: MountScope
  /** Display name used for the breadcrumb root when the scope is derived. */
  displayName?: string
}

const routerCleanups = new WeakMap<AnyRouter, Disposer>()

/**
 * A TanStack router for an MFE: `basepath` is the shell route prefix, the
 * history is the shell navigation, `context.platform` is the live platform
 * context, and context changes invalidate the router so loaders and
 * `beforeLoad` guards run again without remounting.
 */
export function createMfeRouter(options: CreateMfeRouterOptions): AnyRouter {
  const { routeTree, bridge, scope: givenScope, displayName, ...rest } = options
  const scope =
    givenScope ?? createMountScope({ bridge, kind: "mfe", rootElement: null, displayName })
  const basepath = bridge.routePrefix ?? "/"
  const history: ShellHistory = createShellHistory(bridge.navigation, {
    normalizeHref: (href) => normalizeShellHref(href, basepath),
    prefix: basepath,
  })
  const context: MfeRouterContext = { platform: scope.routeContext }
  const userInnerWrap = rest.InnerWrap as
    ((props: { children: ReactNode }) => ReactNode) | undefined
  const InnerWrap = ({ children }: { children: ReactNode }) => {
    const inner = createElement(Fragment, null, createElement(BreadcrumbPublisher), children)
    return userInnerWrap ? userInnerWrap({ children: inner }) : inner
  }
  // TanStack Router publishes every client-side router on `self.__TSR_ROUTER__`,
  // where TanStack Start (`getRouterInstance`) and the router devtools look for
  // *the* application router. That slot belongs to the shell: an MFE router
  // created there must leave it exactly as it was, or the shell would start
  // rendering the remote's route tree inside its own React tree.
  const globalScope =
    typeof self !== "undefined" ? (self as unknown as GlobalRouterScope) : undefined
  const shellRouter = globalScope?.[GLOBAL_ROUTER_KEY]
  const router = createRouter({
    defaultPreload: "intent",
    defaultErrorComponent: DefaultRouteErrorComponent,
    defaultPendingComponent: DefaultPendingComponent,
    defaultNotFoundComponent: DefaultNotFoundComponent,
    ...rest,
    routeTree,
    basepath,
    history,
    context,
    InnerWrap: InnerWrap as never,
  } as never) as AnyRouter
  if (globalScope && globalScope[GLOBAL_ROUTER_KEY] === router) {
    if (shellRouter === undefined) delete globalScope[GLOBAL_ROUTER_KEY]
    else globalScope[GLOBAL_ROUTER_KEY] = shellRouter
  }
  if (globalScope) {
    // Route files of this remote hot-update against the latest router of the MFE.
    const registry = (globalScope[ROUTER_REGISTRY_KEY] ??= {})
    registry[bridge.mfeId] = router
    routerOwners.set(router, bridge.mfeId)
  }

  const cleanups = createDisposer()
  cleanups.add(() => history.dispose())
  // Context changes: the route context object reads the live store, so only
  // the matches need to be invalidated for loaders and guards to run again.
  let revision = bridge.context.getState().revision
  cleanups.add(
    bridge.context.subscribe(() => {
      const next = bridge.context.getState().revision
      if (next === revision) return
      revision = next
      router.invalidate().catch((error: unknown) => {
        bridge.diagnostics.emit({
          type: "log",
          level: "warn",
          message: "Router invalidation after a context change failed.",
          detail: error instanceof Error ? error.message : String(error),
          mfeId: bridge.mfeId,
          instanceId: bridge.instanceId,
        })
      })
    })
  )
  cleanups.add(
    router.subscribe("onResolved", (event) => {
      const last = router.state.matches[router.state.matches.length - 1]
      if (!last) return
      bridge.diagnostics.emit({
        type: "route.matched",
        pathname: event.toLocation.pathname,
        routeId: last.routeId,
        guarded: Boolean(
          (last.staticData as { permissionGroups?: string[] }).permissionGroups?.length
        ),
        mfeId: bridge.mfeId,
        instanceId: bridge.instanceId,
      })
    })
  )
  if (!givenScope) cleanups.add(() => scope.disposer.dispose())
  routerCleanups.set(router, cleanups)
  scope.disposer.add(() => disposeMfeRouter(router))
  return router
}

/** Stop the shell history and context subscriptions of a router created by `createMfeRouter`. */
export function disposeMfeRouter(router: AnyRouter): void {
  const cleanups = routerCleanups.get(router)
  if (!cleanups) return
  routerCleanups.delete(router)
  cleanups.dispose()
  const owner = routerOwners.get(router)
  const registry =
    typeof self !== "undefined"
      ? (self as unknown as GlobalRouterScope)[ROUTER_REGISTRY_KEY]
      : undefined
  if (owner !== undefined && registry?.[owner] === router) delete registry[owner]
}
