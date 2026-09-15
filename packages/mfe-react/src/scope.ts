import {
  createDisposer,
  createPermissionHelpers,
  hrefOf,
  shallowEqual,
  type BreadcrumbEntry,
  type Disposer,
  type HostBridge,
  type InstanceContextState,
  type OverlayRoot,
  type PermissionHelpers,
  type ReadonlyStore,
  type RegistrationOwner,
  type SettingsGroupDefinition,
  type ShellLocation,
  type StorageDiagnostic,
  type StorageStore,
} from "@platform-internal/core"
import type {
  BreadcrumbOverride,
  MfeEnhancer,
  MfeEnhancerContext,
  MfeInstance,
  MountKind,
  NavigateTarget,
  PlatformContextValue,
  PlatformNavigation,
  PlatformRouteContext,
} from "./types"

/** Tiny observable list used for per-mount bookkeeping (diagnostics, overrides). */
export interface Observable<T> {
  get(): T
  set(next: T): void
  subscribe(listener: () => void): () => void
}

export function createObservable<T>(initial: T): Observable<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return
      value = next
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

/**
 * Everything one React root of an MFE needs: the bridge, its identity, a
 * disposer tied to the mount and per-mount caches. Created once per
 * `mount` / `mountWidget` / surface mount and provided through React context.
 */
export interface MountScope {
  readonly bridge: HostBridge
  readonly instance: MfeInstance
  readonly owner: RegistrationOwner
  readonly kind: MountKind
  readonly rootElement: HTMLElement | null
  readonly disposer: Disposer
  readonly cache: Map<string, unknown>
  readonly enhancers: readonly MfeEnhancer[]
  readonly navigation: PlatformNavigation
  readonly contextStore: ReadonlyStore<PlatformContextValue>
  readonly routeContext: PlatformRouteContext
  readonly storageStores: Map<string, StorageStore<unknown>>
  readonly storageDiagnostics: Observable<readonly StorageDiagnostic[]>
  readonly breadcrumbOverrides: Observable<ReadonlyMap<string, BreadcrumbOverride>>
  readonly settingsAggregator: SettingsFieldAggregator
  /** The scope of the mount this scope belongs to (itself for MFE/widget roots). */
  readonly root: MountScope
}

export interface SettingsFieldAggregator {
  add(
    group: string | Omit<SettingsGroupDefinition, "fields">,
    key: string,
    field: SettingsGroupDefinition["fields"][string]
  ): () => void
}

export interface CreateMountScopeOptions {
  bridge: HostBridge
  kind: MountKind
  rootElement: HTMLElement | null
  displayName?: string
  enhancers?: readonly MfeEnhancer[]
  /** Override the widget id (widget mounts). */
  widgetId?: string
  /** Register a group in the settings registry; injected so the aggregator can share the conversion code. */
  registerSettingsGroup?: (
    definition: SettingsGroupDefinition,
    owner: RegistrationOwner
  ) => () => void
}

function buildSearch(search: NavigateTarget["search"]): string {
  if (!search) return ""
  if (typeof search === "string")
    return search.startsWith("?") || search === "" ? search : `?${search}`
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue
    params.set(key, typeof value === "string" ? value : JSON.stringify(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ""
}

export function joinPrefix(prefix: string | undefined, path: string): string {
  const base = !prefix || prefix === "/" ? "" : prefix.replace(/\/+$/, "")
  const rest = path.startsWith("/") ? path : `/${path}`
  return `${base}${rest}` || "/"
}

export function createPlatformNavigation(
  bridge: HostBridge,
  routePrefix: string | undefined
): PlatformNavigation {
  const shell = bridge.navigation
  const toHref = (to: string | NavigateTarget, current: ShellLocation): string => {
    if (typeof to === "string") return to
    const pathname = to.to ?? current.pathname
    const search = to.search === undefined ? "" : buildSearch(to.search)
    const hash = to.hash ? (to.hash.startsWith("#") ? to.hash : `#${to.hash}`) : ""
    return `${pathname}${search}${hash}`
  }
  const navigation: PlatformNavigation = {
    routePrefix,
    navigate(to, options) {
      const current = shell.getLocation()
      const href = toHref(to, current)
      const replace =
        options?.replace ?? (typeof to === "object" ? to.replace : undefined) ?? false
      const state = options?.state ?? (typeof to === "object" ? to.state : undefined)
      if (shell.canLeave && shell.canLeave(href) === false) return
      if (replace) shell.replace(href, { state })
      else shell.push(href, { state })
    },
    navigateWithin(path, options) {
      navigation.navigate(joinPrefix(routePrefix, path), options)
    },
    back: () => shell.back(),
    forward: () => shell.forward(),
    reload: () => shell.reload(),
    get location() {
      return shell.getLocation()
    },
    subscribe(listener) {
      return shell.subscribe((location) => listener(location))
    },
  }
  return navigation
}

/** Derive the `PlatformContextValue` store from the bridge context store; memoised per state snapshot. */
export function createContextValueStore(
  bridge: HostBridge,
  navigation: PlatformNavigation
): ReadonlyStore<PlatformContextValue> {
  let cachedState: InstanceContextState | null = null
  let cachedValue: PlatformContextValue | null = null
  let cachedGroups: string[] | null = null
  let cachedPermissions: PermissionHelpers | null = null
  const getState = (): PlatformContextValue => {
    const state = bridge.context.getState()
    if (cachedValue && cachedState === state) return cachedValue
    if (!cachedPermissions || cachedGroups !== state.permissionGroups) {
      cachedGroups = state.permissionGroups
      cachedPermissions = createPermissionHelpers(state.permissionGroups)
    }
    cachedState = state
    cachedValue = {
      ...state,
      permissions: cachedPermissions,
      telemetry: bridge.telemetry,
      navigation,
      capabilities: state.capabilities,
    } as PlatformContextValue
    return cachedValue
  }
  const store: ReadonlyStore<PlatformContextValue> = {
    getState,
    subscribe: (listener) => bridge.context.subscribe(listener),
    select(selector, listener, equals = shallowEqual) {
      let slice = selector(getState())
      return store.subscribe(() => {
        const next = selector(getState())
        if (equals(slice, next)) return
        slice = next
        listener(next)
      })
    },
  }
  return store
}

/** Route context object whose getters always read the live store. */
export function createRouteContext(
  store: ReadonlyStore<PlatformContextValue>,
  instance: MfeInstance
): PlatformRouteContext {
  const state = () => store.getState()
  return {
    get user() {
      return state().user
    },
    get permissionGroups() {
      return state().permissionGroups
    },
    get permissions() {
      return state().permissions
    },
    get tenant() {
      return state().tenant
    },
    get project() {
      return state().project
    },
    get job() {
      return state().job
    },
    get locale() {
      return state().locale
    },
    get timezone() {
      return state().timezone
    },
    get theme() {
      return state().theme
    },
    get resolvedTheme() {
      return state().resolvedTheme
    },
    get featureFlags() {
      return state().featureFlags
    },
    get capabilities() {
      return state().capabilities
    },
    get runtime() {
      return state().runtime
    },
    get telemetry() {
      return state().telemetry
    },
    get navigation() {
      return state().navigation
    },
    get revision() {
      return state().revision
    },
    mfeId: instance.mfeId,
    instanceId: instance.instanceId,
    getState: state,
    subscribe: (listener) => store.subscribe(listener),
  }
}

function createSettingsFieldAggregator(
  owner: RegistrationOwner,
  register: (definition: SettingsGroupDefinition, owner: RegistrationOwner) => () => void
): SettingsFieldAggregator {
  interface Group {
    meta: Omit<SettingsGroupDefinition, "fields">
    fields: Map<string, SettingsGroupDefinition["fields"][string]>
    unregister: (() => void) | null
  }
  const groups = new Map<string, Group>()
  const sync = (key: string) => {
    const group = groups.get(key)
    if (!group) return
    group.unregister?.()
    group.unregister = null
    if (group.fields.size === 0) {
      groups.delete(key)
      return
    }
    group.unregister = register(
      { ...group.meta, fields: Object.fromEntries(group.fields) },
      owner
    )
  }
  return {
    add(groupInput, key, field) {
      const meta = typeof groupInput === "string" ? { key: groupInput } : groupInput
      let group = groups.get(meta.key)
      if (!group) {
        group = { meta, fields: new Map(), unregister: null }
        groups.set(meta.key, group)
      } else if (typeof groupInput !== "string") {
        group.meta = { ...group.meta, ...meta }
      }
      group.fields.set(key, field)
      sync(meta.key)
      return () => {
        const current = groups.get(meta.key)
        if (!current || current.fields.get(key) !== field) return
        current.fields.delete(key)
        sync(meta.key)
      }
    },
  }
}

// Live route/widget scopes, most recent last: `createPlatformStorage` resolves
// the current mount from here when used outside React (loaders, handlers).
const liveScopes: MountScope[] = []

export function getCurrentMountScope(): MountScope | undefined {
  return liveScopes[liveScopes.length - 1]
}

export function createMountScope(options: CreateMountScopeOptions): MountScope {
  const { bridge } = options
  const widgetId = options.widgetId ?? bridge.widgetId
  const instance: MfeInstance = {
    mfeId: bridge.mfeId,
    instanceId: bridge.instanceId,
    widgetId,
    routePrefix: bridge.routePrefix,
    displayName: options.displayName,
    host: bridge.host,
  }
  const owner: RegistrationOwner = {
    mfeId: bridge.mfeId,
    instanceId: bridge.instanceId,
    widgetId,
    displayName: options.displayName,
  }
  const disposer = createDisposer()
  const navigation = createPlatformNavigation(bridge, bridge.routePrefix)
  const contextStore = createContextValueStore(bridge, navigation)
  const register =
    options.registerSettingsGroup ??
    ((definition: SettingsGroupDefinition, registrationOwner: RegistrationOwner) =>
      bridge.registries.settings.register(definition, registrationOwner))
  const scope: MountScope = {
    bridge,
    instance,
    owner,
    kind: options.kind,
    rootElement: options.rootElement,
    disposer,
    cache: new Map(),
    enhancers: options.enhancers ?? [],
    navigation,
    contextStore,
    routeContext: createRouteContext(contextStore, instance),
    storageStores: new Map(),
    storageDiagnostics: createObservable<readonly StorageDiagnostic[]>([]),
    breadcrumbOverrides: createObservable<ReadonlyMap<string, BreadcrumbOverride>>(new Map()),
    settingsAggregator: createSettingsFieldAggregator(owner, register),
    get root() {
      return scope
    },
  }
  liveScopes.push(scope)
  watchTheme(scope)
  disposer.add(() => {
    const index = liveScopes.indexOf(scope)
    if (index >= 0) liveScopes.splice(index, 1)
    for (const store of scope.storageStores.values()) store.dispose()
    scope.storageStores.clear()
  })
  return scope
}

/** A scope for a React root the host mounts on behalf of this MFE (settings renderer, help content). */
export function createSurfaceScope(parent: MountScope, rootElement: HTMLElement): MountScope {
  const disposer = createDisposer()
  const remove = parent.disposer.add(() => disposer.dispose())
  disposer.add(remove)
  const scope: MountScope = {
    ...parent,
    kind: "surface",
    rootElement,
    disposer,
    cache: new Map(),
    get root() {
      return parent.root
    },
  }
  watchTheme(scope)
  return scope
}

export function enhancerContextOf(scope: MountScope): MfeEnhancerContext {
  return {
    bridge: scope.bridge,
    instance: scope.instance,
    kind: scope.kind,
    rootElement: scope.rootElement,
    disposer: scope.disposer,
    cache: scope.cache,
  }
}

const OVERLAY_ROOT_CACHE_KEY = "platform:overlay-root"

function syncThemeClass(element: HTMLElement | null, dark: boolean): void {
  if (!element) return
  element.classList.toggle("dark", dark)
  element.setAttribute("data-platform-theme", dark ? "dark" : "light")
}

/**
 * The per-mount overlay root (body-level, owner-tagged, created by the shell
 * overlay manager). Created lazily, once per mount (surfaces share the root
 * mount's), disposed with the mount, `dark` class synced with the resolved
 * theme. Non-Tecton MFEs portal their modals into it; `withTecton` hands it
 * to Tecton's `PortalProvider`.
 */
export function ensureOverlayRoot(scope: MountScope): OverlayRoot {
  const root = scope.root
  const cached = root.cache.get(OVERLAY_ROOT_CACHE_KEY) as OverlayRoot | undefined
  if (cached) return cached
  const dark = root.contextStore.getState().resolvedTheme === "dark"
  const overlayRoot = root.bridge.overlays.createRoot({
    owner: {
      mfeId: root.instance.mfeId,
      instanceId: root.instance.instanceId,
      widgetId: root.instance.widgetId,
    },
    attributes: { class: dark ? "dark" : "", "data-platform-theme": dark ? "dark" : "light" },
  })
  root.cache.set(OVERLAY_ROOT_CACHE_KEY, overlayRoot)
  root.disposer.add(() => {
    root.cache.delete(OVERLAY_ROOT_CACHE_KEY)
    overlayRoot.dispose()
  })
  return overlayRoot
}

/** Keep the `dark` class of the MFE root and its overlay root in step with the resolved theme. */
function watchTheme(scope: MountScope): void {
  const apply = () => {
    const dark = scope.contextStore.getState().resolvedTheme === "dark"
    syncThemeClass(scope.rootElement, dark)
    const overlayRoot = scope.cache.get(OVERLAY_ROOT_CACHE_KEY) as OverlayRoot | undefined
    if (overlayRoot) syncThemeClass(overlayRoot.element, dark)
  }
  apply()
  scope.disposer.add(scope.contextStore.select((state) => state.resolvedTheme, apply))
}

export function describeLocation(location: ShellLocation): string {
  return hrefOf(location)
}

export function ownerFields(scope: MountScope): {
  mfeId: string
  instanceId: string
  widgetId?: string
} {
  return {
    mfeId: scope.instance.mfeId,
    instanceId: scope.instance.instanceId,
    widgetId: scope.instance.widgetId,
  }
}

export type { BreadcrumbEntry }
