import { useEffect, useMemo } from "react"
import { useMatch, useRouter, useRouterState, type AnyRouteMatch } from "@tanstack/react-router"
import type { BreadcrumbEntry, BreadcrumbTrail } from "@platform-internal/core"
import { normalizeShellHref } from "./history"
import { useMountScope } from "./provider"
import { useStoreSlice } from "./hooks/store"
import type { MountScope } from "./scope"
import type { BreadcrumbOverride, BreadcrumbStaticData } from "./types"

type Match = AnyRouteMatch

function normalizeStatic(data: BreadcrumbStaticData | undefined) {
  if (data === undefined) return undefined
  return typeof data === "string" ? { label: data } : data
}

function resolveLabel(
  match: Match,
  data: ReturnType<typeof normalizeStatic>
): { label: string | undefined; state: BreadcrumbEntry["state"] } {
  if (match.status === "error") return { label: undefined, state: "unavailable" }
  const loaderData = match.loaderData as Record<string, unknown> | undefined
  const fromLoaderKey = data?.fromLoader
  const loaderLabel = fromLoaderKey
    ? loaderData?.[fromLoaderKey]
    : loaderData && typeof loaderData === "object" && "breadcrumb" in loaderData
      ? loaderData.breadcrumb
      : undefined
  if (match.status === "pending") {
    const label = typeof data?.label === "string" ? data.label : undefined
    return { label, state: "loading" }
  }
  if (typeof loaderLabel === "string") return { label: loaderLabel, state: "ready" }
  if (typeof data?.label === "function") {
    try {
      return { label: data.label(match), state: "ready" }
    } catch {
      return { label: undefined, state: "unavailable" }
    }
  }
  if (typeof data?.label === "string") return { label: data.label, state: "ready" }
  if (fromLoaderKey || loaderData === undefined) {
    return { label: undefined, state: fromLoaderKey ? "unavailable" : "ready" }
  }
  return { label: undefined, state: "ready" }
}

function applyOverride(
  entry: BreadcrumbEntry,
  override: BreadcrumbOverride | undefined
): BreadcrumbEntry {
  if (override === undefined) return entry
  if (typeof override === "string") return { ...entry, label: override, state: "ready" }
  return { ...entry, ...override }
}

/** Build the trail for the current matches (pure; exported for tests). */
export function buildBreadcrumbTrail(
  scope: MountScope,
  matches: Match[],
  buildHref: (match: Match) => string | undefined,
  overrides: ReadonlyMap<string, BreadcrumbOverride>
): BreadcrumbTrail {
  const entries: BreadcrumbEntry[] = []
  const root = matches.find((match) => match.routeId === "__root__")
  const rootStatic = normalizeStatic(
    root?.staticData.breadcrumb as BreadcrumbStaticData | undefined
  )
  const rootLabel =
    typeof rootStatic?.label === "string"
      ? rootStatic.label
      : (scope.instance.displayName ?? scope.instance.mfeId)
  entries.push(
    applyOverride(
      {
        key: "__root__",
        label: rootLabel,
        href: scope.instance.routePrefix ?? "/",
        state: "ready",
        kind: "mfe-root",
        hidden: rootStatic?.hidden,
      },
      overrides.get("__root__")
    )
  )
  for (const match of matches) {
    if (match.routeId === "__root__") continue
    const data = normalizeStatic(
      match.staticData.breadcrumb as BreadcrumbStaticData | undefined
    )
    const loaderData = match.loaderData as Record<string, unknown> | undefined
    const hasLoaderCrumb =
      loaderData && typeof loaderData === "object" && "breadcrumb" in loaderData
    const override = overrides.get(match.routeId)
    if (data === undefined && !hasLoaderCrumb && override === undefined) continue
    const { label, state } = resolveLabel(match, data)
    entries.push(
      applyOverride(
        {
          key: match.routeId,
          label,
          href: buildHref(match),
          state,
          kind: "route",
          hidden: data?.hidden,
        },
        override
      )
    )
  }
  return {
    owner: { mfeId: scope.instance.mfeId, instanceId: scope.instance.instanceId },
    entries,
    updatedAt: Date.now(),
  }
}

function trailsEqual(a: BreadcrumbEntry[], b: BreadcrumbEntry[]): boolean {
  if (a.length !== b.length) return false
  return a.every((entry, index) => {
    const other = b[index]!
    return (
      entry.key === other.key &&
      entry.label === other.label &&
      entry.href === other.href &&
      entry.state === other.state &&
      entry.kind === other.kind &&
      entry.hidden === other.hidden
    )
  })
}

/**
 * Publishes this MFE's breadcrumb trail from the TanStack route matches
 * (`staticData.breadcrumb`, `loaderData.breadcrumb`, `useBreadcrumb`
 * overrides). Rendered inside the router by `createMfeRouter` (`InnerWrap`).
 */
export function BreadcrumbPublisher() {
  const scope = useMountScope("BreadcrumbPublisher")
  const router = useRouter()
  const matches = useRouterState({ select: (state) => state.matches }) as Match[]
  const overrides = useStoreSlice(
    useMemo(
      () => ({
        getState: scope.root.breadcrumbOverrides.get,
        subscribe: scope.root.breadcrumbOverrides.subscribe,
      }),
      [scope]
    ),
    undefined,
    Object.is
  )
  const headless = scope.bridge.host.headless === true
  useEffect(() => {
    if (headless) return
    const buildHref = (match: Match): string | undefined => {
      try {
        const { publicHref } = router.buildLocation({
          to: match.pathname,
          params: match.params,
          search: match.search,
        } as never)
        return normalizeShellHref(publicHref, scope.instance.routePrefix)
      } catch {
        return undefined
      }
    }
    const trail = buildBreadcrumbTrail(scope, matches, buildHref, overrides)
    const previous = scope.bridge.breadcrumbs.getState().trails[scope.instance.instanceId]
    if (previous && trailsEqual(previous.entries, trail.entries)) return
    scope.bridge.breadcrumbs.publish(trail)
  }, [scope, router, matches, overrides, headless])
  return null
}

/**
 * Override the breadcrumb entry of the current route (label, href, state,
 * hidden). Pass `null` to remove the override.
 */
export function useBreadcrumb(entry: BreadcrumbOverride | null): void {
  const scope = useMountScope("useBreadcrumb")
  const routeId = String(useMatch({ strict: false, select: (match) => match.routeId }))
  const identity = JSON.stringify(entry)
  useEffect(() => {
    const overrides = scope.root.breadcrumbOverrides
    const next = new Map(overrides.get())
    if (entry === null) next.delete(routeId)
    else next.set(routeId, entry)
    overrides.set(next)
    return () => {
      const current = new Map(overrides.get())
      if (current.get(routeId) === entry) {
        current.delete(routeId)
        overrides.set(current)
      }
    }
  }, [scope, routeId, identity])
}
