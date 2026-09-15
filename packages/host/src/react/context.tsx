import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { shallowEqual, type DiagnosticEvent } from "@platform-internal/core"

import type { PlatformHost } from "../types"

const PlatformHostContext = createContext<PlatformHost | null>(null)

export function PlatformProvider({
  host,
  children,
}: {
  host: PlatformHost
  children: ReactNode
}) {
  return <PlatformHostContext.Provider value={host}>{children}</PlatformHostContext.Provider>
}

export function usePlatformHost(): PlatformHost {
  const host = useContext(PlatformHostContext)
  if (!host)
    throw new Error("usePlatformHost() needs a <PlatformProvider host={...}> ancestor.")
  return host
}

/** Subscribe to a derived slice of anything; re-renders only when `equals` says the slice changed. */
export function useSubscription<T>(
  subscribe: (listener: () => void) => () => void,
  compute: () => T,
  equals: (a: T, b: T) => boolean = shallowEqual
): T {
  const cache = useRef<{ value: T } | null>(null)
  const getSnapshot = () => {
    const next = compute()
    if (cache.current && equals(cache.current.value, next)) return cache.current.value
    cache.current = { value: next }
    return next
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Slice of the host state (remotes, instances, config) with change subscription. */
export function useHostSelector<T>(
  selector: (host: PlatformHost) => T,
  equals?: (a: T, b: T) => boolean
): T {
  const host = usePlatformHost()
  return useSubscription(
    (listener) => host.subscribe(listener),
    () => selector(host),
    equals
  )
}

/** Slice of the diagnostics log (`host.diagnostics.list()`), updated on every emitted event. */
export function useHostDiagnostics<T = DiagnosticEvent[]>(
  selector: (events: DiagnosticEvent[]) => T = (events) => events as unknown as T,
  equals?: (a: T, b: T) => boolean
): T {
  const host = usePlatformHost()
  return useSubscription(
    (listener) => host.diagnostics.subscribe(() => listener()),
    () => selector(host.diagnostics.list()),
    equals
  )
}

/** Current shell location (subscribes to the shell navigation). */
export function useShellLocation() {
  const host = usePlatformHost()
  return useSubscription(
    (listener) => host.navigation.subscribe(() => listener()),
    () => host.navigation.getLocation(),
    (a, b) => a.pathname === b.pathname && a.search === b.search && a.hash === b.hash
  )
}

/** A counter that increments whenever a registry changes; handy as a memo dependency. */
export function useRegistryVersion(
  kinds: ("commands" | "settings" | "help" | "releaseNotes")[] = [
    "commands",
    "settings",
    "help",
    "releaseNotes",
  ]
): number {
  const host = usePlatformHost()
  const [version, setVersion] = useState(0)
  const key = kinds.join(",")
  useEffect(() => {
    const bump = () => setVersion((value) => value + 1)
    const disposers = kinds.map((kind) => host.registries[kind].events.on("change", bump))
    if (kinds.includes("commands"))
      disposers.push(
        host.registries.commands.events.on("state", bump),
        host.registries.commands.events.on("conflict", bump)
      )
    disposers.push(host.subscribe(bump), host.breadcrumbs.subscribe(bump))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, [host, key])
  return version
}
