import { createStore, type ReadonlyStore, type Store } from "./store"

/**
 * Breadcrumb entries are published by every MFE root from its TanStack route
 * matches (`staticData.breadcrumb` + loader data); the shell renders the
 * global bar. Entries are plain data — labels, links, states — never React.
 */
export interface BreadcrumbEntry {
  /** Stable key within the owner (`route id`). */
  key: string
  label?: string
  /** Absolute href in the shell history. */
  href?: string
  state: "ready" | "loading" | "unavailable"
  /** `shell`, `mfe-root` or `route`. */
  kind: "shell" | "mfe-root" | "route"
  /** Hidden entries stay out of the bar but keep their place for announcements. */
  hidden?: boolean
}

export interface BreadcrumbTrail {
  owner: { mfeId: string; instanceId: string }
  entries: BreadcrumbEntry[]
  updatedAt: number
}

export interface BreadcrumbState {
  shell: BreadcrumbEntry[]
  trails: Record<string, BreadcrumbTrail>
  /** Instance whose trail is shown after the shell entries (the active route MFE). */
  activeInstanceId: string | null
  /** Set by the host when a custom renderer takes over. */
  renderer: "shell" | "custom"
}

export interface BreadcrumbStore extends ReadonlyStore<BreadcrumbState> {
  setShell(entries: BreadcrumbEntry[]): void
  publish(trail: BreadcrumbTrail): void
  clear(instanceId: string): void
  setActive(instanceId: string | null): void
  setRenderer(renderer: "shell" | "custom"): void
  /** Entries currently displayed: shell entries followed by the active trail. */
  current(): BreadcrumbEntry[]
}

export function createBreadcrumbStore(): BreadcrumbStore {
  const store: Store<BreadcrumbState> = createStore<BreadcrumbState>({ shell: [], trails: {}, activeInstanceId: null, renderer: "shell" })
  const current = () => {
    const state = store.getState()
    const active = state.activeInstanceId ? state.trails[state.activeInstanceId] : undefined
    return [...state.shell, ...(active?.entries ?? [])]
  }
  return {
    getState: store.getState,
    subscribe: store.subscribe,
    select: store.select,
    setShell: (entries) => store.patch({ shell: entries }),
    publish: (trail) => store.setState((state) => ({ ...state, trails: { ...state.trails, [trail.owner.instanceId]: trail } })),
    clear: (instanceId) =>
      store.setState((state) => {
        if (!(instanceId in state.trails)) return state
        const trails = { ...state.trails }
        delete trails[instanceId]
        return { ...state, trails, activeInstanceId: state.activeInstanceId === instanceId ? null : state.activeInstanceId }
      }),
    setActive: (instanceId) => store.patch({ activeInstanceId: instanceId }),
    setRenderer: (renderer) => store.patch({ renderer }),
    current,
  }
}

/** Truncate a trail for display: keep the first, the last `keepTail` and collapse the middle. */
export function truncateBreadcrumbs(entries: BreadcrumbEntry[], max = 5, keepTail = 2): (BreadcrumbEntry | { key: "…"; ellipsis: true; collapsed: BreadcrumbEntry[] })[] {
  const visible = entries.filter((entry) => !entry.hidden)
  if (visible.length <= max) return visible
  const head = visible.slice(0, 1)
  const tail = visible.slice(-keepTail)
  const collapsed = visible.slice(1, visible.length - keepTail)
  return [...head, { key: "…", ellipsis: true, collapsed }, ...tail]
}

/** Accessible announcement text: "Assets, Pump 42 (loading)". */
export function announceBreadcrumbs(entries: BreadcrumbEntry[]): string {
  return entries
    .filter((entry) => !entry.hidden)
    .map((entry) => (entry.state === "ready" ? (entry.label ?? "Untitled") : entry.state === "loading" ? `${entry.label ?? "…"} (loading)` : `${entry.label ?? "Unavailable"} (unavailable)`))
    .join(", ")
}
