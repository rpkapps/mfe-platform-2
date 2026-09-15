/**
 * Minimal external store with selector subscriptions. Both the host (React 19)
 * and every MFE root (React 18 or 19) subscribe through `useSyncExternalStore`
 * with their own React instance; the store itself never touches React.
 */
export type Listener = () => void
export type Selector<TState, TSlice> = (state: TState) => TSlice
export type Equality<T> = (a: T, b: T) => boolean

export interface ReadonlyStore<TState> {
  getState(): TState
  subscribe(listener: Listener): () => void
  /** Subscribe to a slice; `listener` only fires when the slice changes (by `equals`). */
  select<TSlice>(
    selector: Selector<TState, TSlice>,
    listener: (slice: TSlice) => void,
    equals?: Equality<TSlice>
  ): () => void
}

export interface Store<TState> extends ReadonlyStore<TState> {
  setState(next: TState | ((previous: TState) => TState)): void
  /** Shallow-merge an object state. */
  patch(partial: Partial<TState>): void
}

export function createStore<TState>(initial: TState): Store<TState> {
  let state = initial
  const listeners = new Set<Listener>()
  const notify = () => {
    for (const listener of Array.from(listeners)) listener()
  }
  const store: Store<TState> = {
    getState: () => state,
    setState(next) {
      const value =
        typeof next === "function" ? (next as (previous: TState) => TState)(state) : next
      if (Object.is(value, state)) return
      state = value
      notify()
    },
    patch(partial) {
      store.setState({ ...(state as object), ...(partial as object) } as TState)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    select(selector, listener, equals = Object.is) {
      let current = selector(state)
      return store.subscribe(() => {
        const next = selector(state)
        if (equals(current, next)) return
        current = next
        listener(next)
      })
    },
  }
  return store
}

/** Shallow equality for objects and arrays, used by slice subscriptions that return fresh objects. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a as object)
  const keysB = Object.keys(b as object)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
      return false
  }
  return true
}

/** Tiny typed event emitter used by registries and diagnostics. */
export interface Emitter<TEvents extends Record<string, unknown>> {
  on<K extends keyof TEvents>(type: K, listener: (payload: TEvents[K]) => void): () => void
  emit<K extends keyof TEvents>(type: K, payload: TEvents[K]): void
  clear(): void
}

export function createEmitter<TEvents extends Record<string, unknown>>(): Emitter<TEvents> {
  const listeners = new Map<keyof TEvents, Set<(payload: never) => void>>()
  return {
    on(type, listener) {
      let set = listeners.get(type)
      if (!set) {
        set = new Set()
        listeners.set(type, set)
      }
      set.add(listener as (payload: never) => void)
      return () => {
        set?.delete(listener as (payload: never) => void)
      }
    },
    emit(type, payload) {
      const set = listeners.get(type)
      if (!set) return
      for (const listener of Array.from(set)) {
        try {
          ;(listener as (payload: TEvents[typeof type]) => void)(payload)
        } catch (error) {
          // A failing listener must not break other listeners or the emitter.
          queueMicrotask(() => {
            throw error
          })
        }
      }
    },
    clear() {
      listeners.clear()
    },
  }
}

/** Collects dispose callbacks so a lifecycle owner can tear everything down at once. */
export interface Disposer {
  add(dispose: () => void): () => void
  dispose(): void
  readonly disposed: boolean
}

export function createDisposer(): Disposer {
  const disposers = new Set<() => void>()
  let disposed = false
  return {
    get disposed() {
      return disposed
    },
    add(dispose) {
      if (disposed) {
        dispose()
        return () => {}
      }
      disposers.add(dispose)
      return () => {
        disposers.delete(dispose)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const dispose of Array.from(disposers).reverse()) {
        try {
          dispose()
        } catch {
          // isolate: one failing cleanup does not block the others
        }
      }
      disposers.clear()
    },
  }
}
