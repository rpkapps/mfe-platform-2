import type { AnyRouter, RouterHistory } from "@tanstack/react-router"
import { isUnderPrefix, parseHref, type NavigateOptions, type ShellLocation, type ShellNavigation } from "@platform-internal/core"

import type { PlatformHost } from "./types"

type HistoryLike = RouterHistory

function toShellLocation(location: HistoryLike["location"]): ShellLocation {
  const state = location.state as { key?: string; __TSR_key?: string } | undefined
  return { pathname: location.pathname, search: location.search, hash: location.hash, state: location.state, key: state?.__TSR_key ?? state?.key }
}

export interface TanStackShellNavigation extends ShellNavigation {
  readonly router: AnyRouter
  dispose(): void
}

/**
 * `ShellNavigation` on a TanStack Router instance: the router's history is
 * the single browser-history owner; remotes navigate through it. Nothing on
 * `window` is patched. Works with browser and memory histories.
 */
export function createTanStackShellNavigation(router: AnyRouter): TanStackShellNavigation {
  const listeners = new Set<(location: ShellLocation, action: "push" | "replace" | "pop") => void>()
  const history = router.history as HistoryLike
  const unsubscribe = history.subscribe(({ location, action }) => {
    const kind: "push" | "replace" | "pop" = action.type === "PUSH" ? "push" : action.type === "REPLACE" ? "replace" : "pop"
    const shellLocation = toShellLocation(location)
    for (const listener of Array.from(listeners)) listener(shellLocation, kind)
  })
  const navigate = (href: string, options: NavigateOptions | undefined, replace: boolean) => {
    const target = parseHref(href)
    const full = `${target.pathname}${target.search}${target.hash}`
    void router.navigate({ href: full, replace, state: options?.state as never } as never).catch(() => {
      // Fall back to the history itself when the router cannot build the location (external href, blocked).
      if (replace) history.replace(full, options?.state)
      else history.push(full, options?.state)
    })
  }
  return {
    router,
    getLocation: () => toShellLocation(history.location),
    push: (href, options) => navigate(href, options, false),
    replace: (href, options) => navigate(href, options, true),
    back: () => history.back(),
    forward: () => history.forward(),
    go: (delta) => history.go(delta),
    reload: () => {
      if (typeof window !== "undefined" && window.location) window.location.reload()
      else void router.invalidate()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    canLeave: () => true,
    dispose: () => {
      unsubscribe()
      listeners.clear()
    },
  }
}

export interface MfeRouteMatch {
  mfeId: string
  routePrefix: string
}

export interface MfeRouteHelpers {
  /** Longest route-prefix match over manifests and registry entries; hidden MFEs may still own routes. */
  matchMfeForPath(pathname: string): MfeRouteMatch | null
  /** All known prefixes, longest first. */
  routePrefixes(): MfeRouteMatch[]
}

/** Helpers for the shell's catch-all `$` route. */
export function mfeRouteHelpers({ host }: { host: PlatformHost }): MfeRouteHelpers {
  const routePrefixes = () =>
    host.remotes
      .list()
      .filter((record) => !(record.manifest && (record.manifest.kind === "widget-library" || (record.definition && !record.definition.hasRoutes))))
      .map((record) => ({ mfeId: record.mfeId, routePrefix: host.routePrefixOf(record.mfeId) }))
      .sort((a, b) => b.routePrefix.length - a.routePrefix.length)
  return {
    routePrefixes,
    matchMfeForPath(pathname) {
      for (const candidate of routePrefixes()) if (isUnderPrefix(pathname, candidate.routePrefix)) return candidate
      return null
    },
  }
}
