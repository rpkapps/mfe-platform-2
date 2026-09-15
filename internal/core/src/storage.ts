import { PlatformError } from "./errors"
import { namespaceKey } from "./identity"
import { formatIssues, validateSync, type AnySchema } from "./standard-schema"
import { createStore, type ReadonlyStore } from "./store"

export type StorageScope = "local" | "session"

/**
 * The shell decides how platform storage persists. A backend stores strings
 * under namespaced keys and notifies same-tab and (for local storage)
 * cross-tab changes.
 */
export interface StorageBackend {
  get(scope: StorageScope, key: string): string | null
  set(scope: StorageScope, key: string, value: string): void
  remove(scope: StorageScope, key: string): void
  /** Notified on changes made through this backend (same tab) and by other tabs where supported. */
  subscribe(scope: StorageScope, key: string, listener: (value: string | null, origin: "same-tab" | "cross-tab") => void): () => void
  /** List keys with a prefix (devtools). */
  keys(scope: StorageScope, prefix?: string): string[]
  readonly available: { local: boolean; session: boolean }
}

export function createMemoryStorageBackend(): StorageBackend & { emitExternal(scope: StorageScope, key: string, value: string | null): void } {
  const stores: Record<StorageScope, Map<string, string>> = { local: new Map(), session: new Map() }
  const listeners = new Map<string, Set<(value: string | null, origin: "same-tab" | "cross-tab") => void>>()
  const id = (scope: StorageScope, key: string) => `${scope}:${key}`
  const emit = (scope: StorageScope, key: string, value: string | null, origin: "same-tab" | "cross-tab") => {
    for (const listener of Array.from(listeners.get(id(scope, key)) ?? [])) listener(value, origin)
  }
  return {
    available: { local: true, session: true },
    get: (scope, key) => stores[scope].get(key) ?? null,
    set(scope, key, value) {
      stores[scope].set(key, value)
      emit(scope, key, value, "same-tab")
    },
    remove(scope, key) {
      stores[scope].delete(key)
      emit(scope, key, null, "same-tab")
    },
    subscribe(scope, key, listener) {
      const set = listeners.get(id(scope, key)) ?? new Set()
      listeners.set(id(scope, key), set)
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
    keys: (scope, prefix = "") => Array.from(stores[scope].keys()).filter((key) => key.startsWith(prefix)),
    emitExternal(scope, key, value) {
      if (value === null) stores[scope].delete(key)
      else stores[scope].set(key, value)
      emit(scope, key, value, "cross-tab")
    },
  }
}

function probe(storage: Storage | undefined): boolean {
  if (!storage) return false
  try {
    const key = "__platform_probe__"
    storage.setItem(key, "1")
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}

/**
 * Browser backend: `localStorage` / `sessionStorage` behind the contract, with
 * one `storage` event listener for cross-tab updates. Falls back to memory per
 * scope when a storage area is blocked. Nothing on `window` is patched.
 */
export function createBrowserStorageBackend(win: Window = window): StorageBackend & { dispose(): void } {
  const memory = createMemoryStorageBackend()
  const areas: Record<StorageScope, Storage | null> = {
    local: probe(safeStorage(() => win.localStorage)) ? win.localStorage : null,
    session: probe(safeStorage(() => win.sessionStorage)) ? win.sessionStorage : null,
  }
  const listeners = new Map<string, Set<(value: string | null, origin: "same-tab" | "cross-tab") => void>>()
  const id = (scope: StorageScope, key: string) => `${scope}:${key}`
  const emit = (scope: StorageScope, key: string, value: string | null, origin: "same-tab" | "cross-tab") => {
    for (const listener of Array.from(listeners.get(id(scope, key)) ?? [])) listener(value, origin)
  }
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== areas.local || !event.key) return
    emit("local", event.key, event.newValue, "cross-tab")
  }
  win.addEventListener("storage", onStorage)
  const area = (scope: StorageScope) => areas[scope]
  return {
    available: { local: areas.local !== null, session: areas.session !== null },
    get(scope, key) {
      const store = area(scope)
      if (!store) return memory.get(scope, key)
      try {
        return store.getItem(key)
      } catch {
        return memory.get(scope, key)
      }
    },
    set(scope, key, value) {
      const store = area(scope)
      if (store) {
        try {
          store.setItem(key, value)
        } catch (error) {
          throw new PlatformError({ code: "STORAGE_UNAVAILABLE", message: `Could not write "${key}" to ${scope} storage.`, source: key, cause: error })
        }
      } else memory.set(scope, key, value)
      emit(scope, key, value, "same-tab")
    },
    remove(scope, key) {
      const store = area(scope)
      if (store) {
        try {
          store.removeItem(key)
        } catch {
          // ignore
        }
      } else memory.remove(scope, key)
      emit(scope, key, null, "same-tab")
    },
    subscribe(scope, key, listener) {
      const set = listeners.get(id(scope, key)) ?? new Set()
      listeners.set(id(scope, key), set)
      set.add(listener)
      return () => {
        set.delete(listener)
      }
    },
    keys(scope, prefix = "") {
      const store = area(scope)
      if (!store) return memory.keys(scope, prefix)
      const keys: string[] = []
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index)
        if (key && key.startsWith(prefix)) keys.push(key)
      }
      return keys
    },
    dispose: () => win.removeEventListener("storage", onStorage),
  }
}

function safeStorage(read: () => Storage): Storage | undefined {
  try {
    return read()
  } catch {
    return undefined
  }
}

/** Envelope written to storage so migrations can see the version. */
export interface StoredEnvelope {
  v: number
  data: unknown
  updatedAt: number
}

export interface StorageStoreOptions<TValue> {
  scope: StorageScope
  /** Local key; namespaced with the owner. */
  key: string
  owner: { mfeId: string; instanceId?: string; instanceScoped?: boolean }
  schema?: AnySchema<TValue>
  defaults: TValue
  /** Schema version; bump it together with `migrate`. */
  version?: number
  migrate?: (stored: unknown, version: number) => TValue | undefined
  backend: StorageBackend
  onDiagnostic?: (diagnostic: StorageDiagnostic) => void
}

export interface StorageDiagnostic {
  code: "STORAGE_INVALID" | "STORAGE_UNAVAILABLE"
  key: string
  scope: StorageScope
  message: string
  recovered: "defaults" | "migrated" | "none"
  owner: { mfeId: string; instanceId?: string }
}

export interface StorageStore<TValue> extends ReadonlyStore<TValue> {
  readonly namespacedKey: string
  readonly scope: StorageScope
  get(): TValue
  set(value: TValue | ((previous: TValue) => TValue)): void
  /** Update one key of an object value. */
  setKey<K extends keyof TValue>(key: K, value: TValue[K] | ((previous: TValue[K]) => TValue[K])): void
  reset(): void
  /** Last validation problem, cleared on the next valid read/write. */
  readonly lastError: StorageDiagnostic | null
  dispose(): void
}

export function createStorageStore<TValue>(options: StorageStoreOptions<TValue>): StorageStore<TValue> {
  const { scope, backend, defaults } = options
  const version = options.version ?? 1
  const namespacedKey = namespaceKey({ mfeId: options.owner.mfeId, instanceId: options.owner.instanceScoped ? options.owner.instanceId : undefined, key: `${scope}:${options.key}` })
  const owner = { mfeId: options.owner.mfeId, instanceId: options.owner.instanceId }
  let lastError: StorageDiagnostic | null = null

  const validate = (value: unknown): { ok: true; value: TValue } | { ok: false; message: string } => {
    if (!options.schema) return { ok: true, value: value as TValue }
    const result = validateSync(options.schema, value)
    return result.ok ? { ok: true, value: result.value as TValue } : { ok: false, message: formatIssues(result.issues) }
  }
  const report = (diagnostic: StorageDiagnostic) => {
    lastError = diagnostic
    options.onDiagnostic?.(diagnostic)
  }

  const read = (raw: string | null): TValue => {
    if (raw === null) return defaults
    let envelope: StoredEnvelope
    try {
      envelope = JSON.parse(raw) as StoredEnvelope
      if (!envelope || typeof envelope !== "object" || !("data" in envelope)) throw new Error("not an envelope")
    } catch (error) {
      report({ code: "STORAGE_INVALID", key: namespacedKey, scope, message: `malformed JSON: ${error instanceof Error ? error.message : String(error)}`, recovered: "defaults", owner })
      return defaults
    }
    if (envelope.v !== version) {
      if (options.migrate) {
        try {
          const migrated = options.migrate(envelope.data, envelope.v)
          if (migrated !== undefined) {
            const check = validate(migrated)
            if (check.ok) {
              lastError = null
              return check.value
            }
            report({ code: "STORAGE_INVALID", key: namespacedKey, scope, message: `migration from v${envelope.v} produced an invalid value: ${check.message}`, recovered: "defaults", owner })
            return defaults
          }
        } catch (error) {
          report({ code: "STORAGE_INVALID", key: namespacedKey, scope, message: `migration from v${envelope.v} failed: ${error instanceof Error ? error.message : String(error)}`, recovered: "defaults", owner })
          return defaults
        }
      }
      report({ code: "STORAGE_INVALID", key: namespacedKey, scope, message: `stored version v${envelope.v} does not match v${version} and no migration applies`, recovered: "defaults", owner })
      return defaults
    }
    const check = validate(envelope.data)
    if (check.ok) {
      lastError = null
      return check.value
    }
    if (options.migrate) {
      try {
        const migrated = options.migrate(envelope.data, envelope.v)
        if (migrated !== undefined) {
          const recheck = validate(migrated)
          if (recheck.ok) {
            report({ code: "STORAGE_INVALID", key: namespacedKey, scope, message: `stored value was invalid (${check.message}); migrated`, recovered: "migrated", owner })
            return recheck.value
          }
        }
      } catch {
        // fall through to defaults
      }
    }
    report({ code: "STORAGE_INVALID", key: namespacedKey, scope, message: `stored value is invalid: ${check.message}`, recovered: "defaults", owner })
    return defaults
  }

  const store = createStore<TValue>(read(backend.get(scope, namespacedKey)))
  const unsubscribe = backend.subscribe(scope, namespacedKey, (raw) => {
    store.setState(read(raw))
  })

  const write = (value: TValue) => {
    const check = validate(value)
    if (!check.ok) {
      throw new PlatformError({ code: "STORAGE_INVALID", message: `Value for "${options.key}" fails its schema: ${check.message}`, owner, source: namespacedKey })
    }
    const envelope: StoredEnvelope = { v: version, data: check.value, updatedAt: Date.now() }
    backend.set(scope, namespacedKey, JSON.stringify(envelope))
    lastError = null
  }

  return {
    namespacedKey,
    scope,
    getState: store.getState,
    subscribe: store.subscribe,
    select: store.select,
    get: store.getState,
    set(value) {
      const next = typeof value === "function" ? (value as (previous: TValue) => TValue)(store.getState()) : value
      write(next)
    },
    setKey(key, value) {
      const previous = store.getState()
      const nextValue = typeof value === "function" ? (value as (p: TValue[typeof key]) => TValue[typeof key])(previous[key]) : value
      write({ ...(previous as object), [key]: nextValue } as TValue)
    },
    reset() {
      backend.remove(scope, namespacedKey)
      lastError = null
    },
    get lastError() {
      return lastError
    },
    dispose: unsubscribe,
  }
}
