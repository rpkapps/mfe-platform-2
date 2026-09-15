import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { PlatformError, type HostBridge } from "@platform-internal/core"
import { createMountScope, enhancerContextOf, type MountScope } from "./scope"
import type { MfeEnhancer, MountKind } from "./types"

export const MountScopeContext = createContext<MountScope | null>(null)
MountScopeContext.displayName = "PlatformMountScope"

/** Read the mount scope; throws a clear `PlatformError` outside a platform mount. */
export function useMountScope(hook = "usePlatform"): MountScope {
  const scope = useContext(MountScopeContext)
  if (!scope) {
    throw new PlatformError({
      code: "INTERNAL",
      message: `${hook}() must be used inside an MFE or widget mounted by createMfe (or inside PlatformTestProvider in tests).`,
      source: hook,
    })
  }
  return scope
}

/** Apply the definition's enhancers (outermost first) around `children`. */
export function applyEnhancers(children: ReactNode, scope: MountScope): ReactNode {
  const context = enhancerContextOf(scope)
  let node = children
  for (let index = scope.enhancers.length - 1; index >= 0; index -= 1) {
    node = scope.enhancers[index]!.wrap(node, context)
  }
  return node
}

export type PlatformProviderProps =
  | { scope: MountScope; children: ReactNode }
  | {
      /** Build a scope from a bridge (tests, custom bootstraps). Disposed on unmount. */
      bridge: HostBridge
      widgetId?: string
      displayName?: string
      kind?: MountKind
      enhancers?: readonly MfeEnhancer[]
      rootElement?: HTMLElement | null
      children: ReactNode
    }

/**
 * Provides the platform to the React tree of one root. `createMfe` renders it
 * for you; use it directly only in tests (`PlatformTestProvider`) or custom
 * bootstraps.
 */
export function PlatformProvider(props: PlatformProviderProps) {
  if ("scope" in props) {
    return (
      <MountScopeContext.Provider value={props.scope}>{props.children}</MountScopeContext.Provider>
    )
  }
  return <BridgeScopeProvider {...props} />
}

function BridgeScopeProvider(props: Exclude<PlatformProviderProps, { scope: MountScope }>) {
  const { bridge, widgetId, displayName, kind, enhancers, rootElement } = props
  const create = () =>
    createMountScope({
      bridge,
      kind: kind ?? (widgetId ?? bridge.widgetId ? "widget" : "mfe"),
      rootElement: rootElement ?? null,
      displayName,
      enhancers,
      widgetId,
    })
  const [scope, setScope] = useState(create)
  useEffect(() => {
    // StrictMode replays effects: a scope disposed by the simulated unmount is replaced.
    if (scope.disposer.disposed) {
      setScope(create())
      return
    }
    return () => scope.disposer.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])
  return (
    <MountScopeContext.Provider value={scope}>
      {applyEnhancers(props.children, scope)}
    </MountScopeContext.Provider>
  )
}
