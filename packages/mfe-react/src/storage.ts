import {
  createStorageStore,
  PlatformError,
  shallowEqual,
  type AnySchema,
  type Equality,
  type HostBridge,
  type StorageDiagnostic,
  type StorageScope,
  type StorageStore,
} from "@platform-internal/core"
import { useMountScope } from "./provider"
import { getCurrentMountScope, type MountScope } from "./scope"
import { useStoreSlice } from "./hooks/store"

export interface PlatformStorageOptions<TValue> {
  scope: StorageScope
  /** Local key; namespaced with `mfeId` (and `instanceId` when `instanceScoped`). */
  key: string
  /** Standard Schema (Zod 4, Valibot…) validating reads and writes. */
  schema?: AnySchema<TValue>
  defaults: TValue
  /** Schema version; bump together with `migrate`. */
  version?: number
  migrate?: (stored: unknown, version: number) => TValue | undefined
  /** Namespace with the instance id (widgets rendered several times). */
  instanceScoped?: boolean
}

/** Where a store resolves from when used outside React: a mount scope, or a bridge (tests, loaders). */
export type StorageBinding = MountScope | { bridge: HostBridge }

/**
 * A typed, namespaced, schema-backed store definition. It is bound to the
 * current mount lazily: `use()` inside components, `get()/set()` inside
 * handlers and loaders of the mounted MFE.
 */
export interface PlatformStorage<TValue> {
  readonly options: PlatformStorageOptions<TValue>
  /** Subscribe from a component; with a selector the component rerenders only when the slice changes. */
  use(): TValue
  use<TSlice>(selector: (value: TValue) => TSlice, equals?: Equality<TSlice>): TSlice
  get(): TValue
  set(value: TValue | ((previous: TValue) => TValue)): void
  setKey<K extends keyof TValue>(
    key: K,
    value: TValue[K] | ((previous: TValue[K]) => TValue[K])
  ): void
  reset(): void
  subscribe(listener: (value: TValue) => void): () => void
  /**
   * The store bound to the component's own mount. Use it for event handlers in
   * components that can be mounted several times (widgets): `get`/`set` on the
   * definition itself resolve the most recent live mount.
   */
  useStore(): StorageStore<TValue>
  /** Resolve the underlying store for a specific mount or bridge (advanced, tests). */
  bind(binding: StorageBinding): StorageStore<TValue>
}

function isMountScope(binding: StorageBinding): binding is MountScope {
  return "contextStore" in binding && "disposer" in binding
}

const bridgeStores = new WeakMap<HostBridge, Map<string, StorageStore<unknown>>>()

function storeKey(options: PlatformStorageOptions<unknown>): string {
  return `${options.scope}:${options.key}:${options.instanceScoped ? "instance" : "mfe"}`
}

/** Resolve (and cache per mount) the store for a definition. */
export function resolveStorageStore<TValue>(
  options: PlatformStorageOptions<TValue>,
  binding: StorageBinding
): StorageStore<TValue> {
  const key = storeKey(options)
  const bridge = binding.bridge
  const cache = isMountScope(binding)
    ? binding.root.storageStores
    : (bridgeStores.get(bridge) ?? bridgeStores.set(bridge, new Map()).get(bridge)!)
  const existing = cache.get(key)
  if (existing) return existing as StorageStore<TValue>
  const scope = isMountScope(binding) ? binding.root : null
  const store = createStorageStore<TValue>({
    scope: options.scope,
    key: options.key,
    owner: {
      mfeId: bridge.mfeId,
      instanceId: bridge.instanceId,
      instanceScoped: options.instanceScoped,
    },
    schema: options.schema,
    defaults: options.defaults,
    version: options.version,
    migrate: options.migrate,
    backend: bridge.storage,
    onDiagnostic: (diagnostic: StorageDiagnostic) => {
      bridge.diagnostics.emit({
        type: "storage.invalid",
        key: diagnostic.key,
        scope: diagnostic.scope,
        message: diagnostic.message,
        recovered: diagnostic.recovered,
        mfeId: bridge.mfeId,
        instanceId: bridge.instanceId,
        widgetId: bridge.widgetId,
      })
      if (scope) scope.storageDiagnostics.set([...scope.storageDiagnostics.get(), diagnostic])
    },
  })
  cache.set(key, store as StorageStore<unknown>)
  return store
}

export function createPlatformStorage<TValue>(
  options: PlatformStorageOptions<TValue>
): PlatformStorage<TValue> {
  const current = (): StorageStore<TValue> => {
    const scope = getCurrentMountScope()
    if (!scope) {
      throw new PlatformError({
        code: "INTERNAL",
        message: `Storage "${options.key}" was used outside a mounted MFE. Call it from a mounted component, loader or handler, or bind it explicitly with \`.bind({ bridge })\`.`,
        source: options.key,
      })
    }
    return resolveStorageStore(options, scope)
  }
  const storage: PlatformStorage<TValue> = {
    options,
    use(selector?: (value: TValue) => unknown, equals: Equality<unknown> = shallowEqual) {
      return usePlatformStorage(storage, selector as (value: TValue) => unknown, equals)
    },
    get: () => current().get(),
    set: (value) => current().set(value),
    setKey: (key, value) => current().setKey(key, value),
    reset: () => current().reset(),
    subscribe(listener) {
      const store = current()
      return store.subscribe(() => listener(store.get()))
    },
    useStore: () => useStorageStore(storage),
    bind: (binding) => resolveStorageStore(options, binding),
  } as PlatformStorage<TValue>
  return storage
}

/** Read a platform storage store from a component; rerenders only when the selected slice changes. */
export function usePlatformStorage<TValue>(storage: PlatformStorage<TValue>): TValue
export function usePlatformStorage<TValue, TSlice>(
  storage: PlatformStorage<TValue>,
  selector: (value: TValue) => TSlice,
  equals?: Equality<TSlice>
): TSlice
export function usePlatformStorage<TValue, TSlice>(
  storage: PlatformStorage<TValue>,
  selector?: (value: TValue) => TSlice,
  equals: Equality<TSlice> = shallowEqual
): TValue | TSlice {
  const scope = useMountScope("usePlatformStorage")
  const store = resolveStorageStore(storage.options, scope)
  return useStoreSlice(store, selector, equals)
}

/** Storage validation problems recorded for this mount (malformed data, failed migrations). */
/** The store of `storage` bound to the calling component's mount (stable per mount). */
export function useStorageStore<TValue>(
  storage: PlatformStorage<TValue>
): StorageStore<TValue> {
  const scope = useMountScope("useStorageStore")
  return resolveStorageStore(storage.options, scope)
}

export function useStorageDiagnostics(): readonly StorageDiagnostic[] {
  const scope = useMountScope("useStorageDiagnostics")
  return useStoreSlice(
    {
      getState: scope.root.storageDiagnostics.get,
      subscribe: scope.root.storageDiagnostics.subscribe,
    },
    undefined,
    Object.is
  )
}
