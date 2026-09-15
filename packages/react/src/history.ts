import {
  createHistory,
  parseHref,
  type HistoryLocation,
  type NavigationBlocker,
  type ParsedHistoryState,
  type RouterHistory,
} from "@tanstack/history"
import { hrefOf, type ShellLocation, type ShellNavigation } from "@platform-internal/core"

const INDEX_KEY = "__TSR_index"

export interface ShellHistory extends RouterHistory {
  /** Stop forwarding shell navigation events (called by `disposeMfeRouter` / the mount). */
  dispose(): void
}

export interface ShellHistoryOptions {
  /** Applied to every href before it reaches the shell (`createMfeRouter` drops the root trailing slash). */
  normalizeHref?: (href: string) => string
}

/**
 * TanStack addresses the root route under a basepath as `/prefix/`; the shell
 * addresses an MFE root as `/prefix`. Drop that one trailing slash.
 */
export function normalizeShellHref(href: string, routePrefix: string | undefined): string {
  if (!routePrefix || routePrefix === "/") return href
  const withSlash = `${routePrefix}/`
  if (href === withSlash) return routePrefix
  if (href.startsWith(withSlash) && /^[?#]/.test(href.slice(withSlash.length))) {
    return `${routePrefix}${href.slice(withSlash.length)}`
  }
  return href
}

function toHistoryLocation(
  location: ShellLocation,
  fallbackIndex: number,
  indexByKey: Map<string, number>
): HistoryLocation {
  const raw = location.state
  const base = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  const key =
    (base.__TSR_key as string | undefined) ?? (base.key as string | undefined) ?? location.key
  let index = fallbackIndex
  if (typeof base[INDEX_KEY] === "number") index = base[INDEX_KEY] as number
  else if (location.key !== undefined && indexByKey.has(location.key))
    index = indexByKey.get(location.key)!
  if (location.key !== undefined) indexByKey.set(location.key, index)
  const state = {
    ...base,
    ...(key ? { key, __TSR_key: key } : {}),
    [INDEX_KEY]: index,
  } as ParsedHistoryState
  return parseHref(hrefOf(location), state)
}

/**
 * A TanStack `RouterHistory` backed by the shell navigation contract. The
 * MFE router pushes and replaces through the shell; popstate and shell-side
 * navigations reach the router through `navigation.subscribe`. Nothing here
 * touches `window.history` or listens to `popstate`.
 */
export function createShellHistory(
  navigation: ShellNavigation,
  options: ShellHistoryOptions = {}
): ShellHistory {
  const normalize = options.normalizeHref ?? ((href: string) => href)
  let blockers: NavigationBlocker[] = []
  let index = 0
  // Shell entries without a TanStack index in their state (the initial entry,
  // shell-side pushes) are remembered by entry key so back/forward can tell
  // which way the history moved.
  const indexByKey = new Map<string, number>()
  // True while a push/replace initiated by this history is in flight: the
  // shell's synchronous subscriber echo must not notify the router twice.
  let internal = false
  const getLocation = () => toHistoryLocation(navigation.getLocation(), index, indexByKey)
  const history = createHistory({
    getLocation,
    getLength: () => index + 1,
    pushState(rawPath, state) {
      const path = normalize(rawPath)
      if (navigation.canLeave && navigation.canLeave(path) === false) return
      index = typeof state?.[INDEX_KEY] === "number" ? state[INDEX_KEY] : index + 1
      internal = true
      try {
        navigation.push(path, { state })
      } finally {
        internal = false
      }
    },
    replaceState(rawPath, state) {
      const path = normalize(rawPath)
      if (navigation.canLeave && navigation.canLeave(path) === false) return
      internal = true
      try {
        navigation.replace(path, { state })
      } finally {
        internal = false
      }
    },
    go: (delta) => navigation.go(delta),
    back: () => navigation.back(),
    forward: () => navigation.forward(),
    createHref: (path) => normalize(path),
    getBlockers: () => blockers,
    setBlockers: (next) => {
      blockers = next
    },
    // Index changes (back/forward/go) are reported by the shell subscription
    // once the shell has actually moved (synchronously for memory navigation,
    // after popstate for the browser).
    notifyOnIndexChange: false,
    destroy: () => unsubscribe(),
  })
  const unsubscribe = navigation.subscribe((location, action) => {
    if (internal) return
    const previous = index
    const next = toHistoryLocation(
      location,
      action === "push" ? previous + 1 : previous,
      indexByKey
    )
    index = next.state[INDEX_KEY]
    if (action === "push") history.notify({ type: "PUSH" })
    else if (action === "replace") history.notify({ type: "REPLACE" })
    else {
      const delta = index - previous
      if (delta === -1) history.notify({ type: "BACK" })
      else if (delta === 1) history.notify({ type: "FORWARD" })
      else history.notify({ type: "GO", index: delta })
    }
  })
  return Object.assign(history, { dispose: unsubscribe })
}
