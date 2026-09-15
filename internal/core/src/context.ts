import type { CapabilityId } from "./capabilities"
import type { RuntimeEnvValue } from "./runtime-config"
import { createStore, shallowEqual, type ReadonlyStore, type Store } from "./store"

/**
 * Platform context: what the shell knows about the session. The host owns a
 * store of it; each MFE root subscribes to slices through its own React
 * instance. Everything here is plain data (no React values).
 */
export interface PlatformUser {
  id: string
  displayName: string
  email?: string
  avatarUrl?: string
  /** Opaque session correlation id for telemetry. */
  sessionId?: string
}

export interface TenantContext {
  id: string
  name?: string
}

export interface ProjectContext {
  id: string
  name?: string
}

export interface JobContext {
  id: string
  name?: string
  status?: string
}

export type Theme = "light" | "dark" | "system"

export interface ReleaseContextInfo {
  /** Shell release. */
  shell: { version?: string; buildId?: string; commit?: string }
  /** The current remote's release, filled in per instance. */
  remote?: { version: string; buildId?: string; commit?: string }
}

export interface RuntimeEnvironmentInfo {
  environment: string
  /** Allow-listed values for this MFE (`mfes.<mfeId>.env`). */
  env: Record<string, RuntimeEnvValue>
  /** Values every MFE receives. */
  shared: Record<string, RuntimeEnvValue>
}

/** Shell-level state, identical for every remote. */
export interface ShellContextState {
  user: PlatformUser | null
  /** All groups the host policy exposes to the browser (not backend authorization). */
  permissionGroups: string[]
  tenant: TenantContext | null
  project: ProjectContext | null
  job: JobContext | null
  locale: string
  timezone: string
  theme: Theme
  /** Resolved theme (`light` | `dark`) when `theme` is `system`. */
  resolvedTheme: "light" | "dark"
  featureFlags: Record<string, boolean | string | number>
  environment: string
  release: ReleaseContextInfo["shell"]
  /** Increments on every context revision so loaders can depend on it. */
  revision: number
}

export const DEFAULT_SHELL_CONTEXT: ShellContextState = {
  user: null,
  permissionGroups: [],
  tenant: null,
  project: null,
  job: null,
  locale: "en-US",
  timezone: "UTC",
  theme: "system",
  resolvedTheme: "light",
  featureFlags: {},
  environment: "production",
  release: {},
  revision: 0,
}

export interface PermissionHelpers {
  hasGroup(group: string): boolean
  hasAnyGroup(groups: readonly string[]): boolean
  hasAllGroups(groups: readonly string[]): boolean
}

export function createPermissionHelpers(groups: readonly string[]): PermissionHelpers {
  const set = new Set(groups)
  return {
    hasGroup: (group) => set.has(group),
    hasAnyGroup: (list) => list.some((group) => set.has(group)),
    hasAllGroups: (list) => list.every((group) => set.has(group)),
  }
}

export type ShellContextStore = Store<ShellContextState>

export function createShellContextStore(initial: Partial<ShellContextState> = {}): ShellContextStore {
  const store = createStore<ShellContextState>({ ...DEFAULT_SHELL_CONTEXT, ...initial })
  const originalSetState = store.setState
  // Every change bumps the revision so dependent loaders can invalidate.
  store.setState = (next) => {
    originalSetState((previous) => {
      const value = typeof next === "function" ? (next as (p: ShellContextState) => ShellContextState)(previous) : next
      if (value === previous) return previous
      return { ...value, revision: previous.revision + 1 }
    })
  }
  store.patch = (partial) => store.setState((previous) => ({ ...previous, ...partial }))
  return store
}

/** Per-instance view: shell state plus the remote's own runtime env, release and approved capabilities. */
export interface InstanceContextState extends ShellContextState {
  mfeId: string
  instanceId: string
  widgetId?: string
  capabilities: CapabilityId[]
  runtime: RuntimeEnvironmentInfo
  remoteRelease?: ReleaseContextInfo["remote"]
}

export interface InstanceContextInput {
  mfeId: string
  instanceId: string
  widgetId?: string
  capabilities: CapabilityId[]
  runtime: RuntimeEnvironmentInfo
  remoteRelease?: ReleaseContextInfo["remote"]
}

/** Derive an instance-scoped read-only store from the shell store; memoised so unrelated shell changes keep referential stability per slice. */
export function createInstanceContextStore(shell: ReadonlyStore<ShellContextState>, input: InstanceContextInput): ReadonlyStore<InstanceContextState> & { update(input: Partial<InstanceContextInput>): void } {
  let current = input
  let cached: InstanceContextState | null = null
  let cachedShell: ShellContextState | null = null
  const listeners = new Set<() => void>()
  const compute = (): InstanceContextState => {
    const shellState = shell.getState()
    if (cached && cachedShell === shellState) return cached
    cachedShell = shellState
    cached = { ...shellState, ...current }
    return cached
  }
  const notify = () => {
    cached = null
    for (const listener of Array.from(listeners)) listener()
  }
  shell.subscribe(notify)
  const store: ReadonlyStore<InstanceContextState> & { update(input: Partial<InstanceContextInput>): void } = {
    getState: compute,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    select(selector, listener, equals = shallowEqual) {
      let slice = selector(compute())
      return store.subscribe(() => {
        const next = selector(compute())
        if (equals(slice, next)) return
        slice = next
        listener(next)
      })
    },
    update(partial) {
      current = { ...current, ...partial }
      notify()
    },
  }
  return store
}
