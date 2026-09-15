/**
 * The shell owns browser history. Remotes navigate through this contract; the
 * SDK wraps it in a private TanStack history adapter. Nothing here touches
 * `window.history` directly except the shell's own implementation.
 */
export interface ShellLocation {
  pathname: string
  search: string
  hash: string
  /** Router state object associated with the entry, if any. */
  state?: unknown
  /** Monotonic key of the history entry. */
  key?: string
}

export interface NavigateOptions {
  replace?: boolean
  state?: unknown
}

export interface ShellNavigation {
  getLocation(): ShellLocation
  push(href: string, options?: NavigateOptions): void
  replace(href: string, options?: NavigateOptions): void
  back(): void
  forward(): void
  go(delta: number): void
  reload(): void
  /** Subscribe to location changes (pushes, replaces, popstate). */
  subscribe(
    listener: (location: ShellLocation, action: "push" | "replace" | "pop") => void
  ): () => void
  /** Called by the SDK before a navigation; returning `false` blocks it (used for blockers). */
  canLeave?(next: string): boolean
}

export function hrefOf(location: ShellLocation): string {
  return `${location.pathname}${location.search}${location.hash}`
}

export function parseHref(href: string): ShellLocation {
  const hashIndex = href.indexOf("#")
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : ""
  const withoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href
  const searchIndex = withoutHash.indexOf("?")
  const search = searchIndex >= 0 ? withoutHash.slice(searchIndex) : ""
  const pathname = searchIndex >= 0 ? withoutHash.slice(0, searchIndex) : withoutHash
  return { pathname: pathname || "/", search, hash }
}

/** In-memory implementation for tests and server rendering (no `window` needed). */
export function createMemoryNavigation(
  initial = "/"
): ShellNavigation & { entries: ShellLocation[]; index: number } {
  const listeners = new Set<
    (location: ShellLocation, action: "push" | "replace" | "pop") => void
  >()
  let counter = 0
  const nav = {
    entries: [{ ...parseHref(initial), key: `k${(counter += 1)}` }],
    index: 0,
    getLocation: () => nav.entries[nav.index]!,
    push(href: string, options?: NavigateOptions) {
      nav.entries = nav.entries.slice(0, nav.index + 1)
      nav.entries.push({ ...parseHref(href), state: options?.state, key: `k${(counter += 1)}` })
      nav.index = nav.entries.length - 1
      emit("push")
    },
    replace(href: string, options?: NavigateOptions) {
      nav.entries[nav.index] = {
        ...parseHref(href),
        state: options?.state,
        key: `k${(counter += 1)}`,
      }
      emit("replace")
    },
    back: () => nav.go(-1),
    forward: () => nav.go(1),
    go(delta: number) {
      const next = nav.index + delta
      if (next < 0 || next >= nav.entries.length) return
      nav.index = next
      emit("pop")
    },
    reload() {
      emit("replace")
    },
    subscribe(listener: (location: ShellLocation, action: "push" | "replace" | "pop") => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  const emit = (action: "push" | "replace" | "pop") => {
    for (const listener of Array.from(listeners)) listener(nav.getLocation(), action)
  }
  return nav
}

/**
 * Browser implementation used by shells without a router. Uses the History API
 * through ordinary calls and one `popstate` listener — it never patches
 * `pushState`, `replaceState` or `history`.
 */
export function createBrowserNavigation(
  win: Window = window
): ShellNavigation & { dispose(): void } {
  const listeners = new Set<
    (location: ShellLocation, action: "push" | "replace" | "pop") => void
  >()
  const read = (): ShellLocation => ({
    pathname: win.location.pathname,
    search: win.location.search,
    hash: win.location.hash,
    state: win.history.state,
  })
  const emit = (action: "push" | "replace" | "pop") => {
    const location = read()
    for (const listener of Array.from(listeners)) listener(location, action)
  }
  const onPop = () => emit("pop")
  win.addEventListener("popstate", onPop)
  return {
    getLocation: read,
    push(href, options) {
      win.history.pushState(options?.state ?? null, "", href)
      emit("push")
    },
    replace(href, options) {
      win.history.replaceState(options?.state ?? null, "", href)
      emit("replace")
    },
    back: () => win.history.back(),
    forward: () => win.history.forward(),
    go: (delta) => win.history.go(delta),
    reload: () => win.location.reload(),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => win.removeEventListener("popstate", onPop),
  }
}

/** True when `href` is under `prefix` (`/asset-tracker` matches `/asset-tracker` and `/asset-tracker/x`, not `/asset-trackers`). */
export function isUnderPrefix(pathname: string, prefix: string): boolean {
  if (prefix === "/") return true
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}
