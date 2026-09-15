import { useCallback, useRef, useSyncExternalStore } from "react"
import { shallowEqual, type Equality, type ReadonlyStore } from "@platform-internal/core"

const identity = <T>(value: T): T => value

interface SliceCache<TState, TSlice> {
  state: TState
  selector: (state: TState) => TSlice
  slice: TSlice
}

/**
 * Subscribe to a slice of an external store with `useSyncExternalStore`
 * (React 18.2+). The selector runs only when the store state or the selector
 * changes, and an equal slice keeps its previous reference so the component
 * does not rerender.
 */
export function useStoreSlice<TState, TSlice = TState>(
  store: Pick<ReadonlyStore<TState>, "getState" | "subscribe">,
  selector?: (state: TState) => TSlice,
  equals: Equality<TSlice> = shallowEqual
): TSlice {
  const select = (selector ?? (identity as unknown as (state: TState) => TSlice)) as (
    state: TState
  ) => TSlice
  const selectorRef = useRef(select)
  const equalsRef = useRef(equals)
  selectorRef.current = select
  equalsRef.current = equals
  const cache = useRef<SliceCache<TState, TSlice> | null>(null)
  const getSnapshot = useCallback((): TSlice => {
    const state = store.getState()
    const current = cache.current
    const currentSelector = selectorRef.current
    if (current && current.state === state && current.selector === currentSelector) {
      return current.slice
    }
    const next = currentSelector(state)
    if (current && equalsRef.current(current.slice, next)) {
      cache.current = { state, selector: currentSelector, slice: current.slice }
      return current.slice
    }
    cache.current = { state, selector: currentSelector, slice: next }
    return next
  }, [store])
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
