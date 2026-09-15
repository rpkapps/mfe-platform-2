import { useEffect, useMemo, type ReactNode } from "react"
import {
  announceBreadcrumbs,
  truncateBreadcrumbs,
  type BreadcrumbEntry,
} from "@platform-internal/core"

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "@tecton/react/components/breadcrumb"

import { usePlatformHost, useSubscription } from "@platform/host-react"

export interface BreadcrumbsProps {
  /** Escape hatch: render the trail yourself (the store is marked `renderer: "custom"`). */
  renderer?: (entries: BreadcrumbEntry[]) => ReactNode
  maxItems?: number
  className?: string
  /** Label for the live region announcement prefix. */
  announcePrefix?: string
}

/** Shell-owned breadcrumb bar: shell entries followed by the active MFE trail, truncated, announced. */
export function Breadcrumbs({
  renderer,
  maxItems = 5,
  className,
  announcePrefix = "Location:",
}: BreadcrumbsProps) {
  const host = usePlatformHost()
  const state = useSubscription(
    (listener) => host.breadcrumbs.subscribe(listener),
    () => host.breadcrumbs.getState(),
    Object.is
  )
  const entries = useMemo(() => {
    const active = state.activeInstanceId ? state.trails[state.activeInstanceId] : undefined
    const record = active ? host.remotes.get(active.owner.mfeId) : undefined
    // An MFE that renders its own breadcrumbs keeps the shell bar to the shell entries.
    const mfeRenders = record?.manifest?.breadcrumbs.renderer === "mfe"
    return [...state.shell, ...(active && !mfeRenders ? active.entries : [])]
  }, [state, host])
  useEffect(() => {
    if (!renderer) return
    host.breadcrumbs.setRenderer("custom")
    return () => host.breadcrumbs.setRenderer("shell")
  }, [renderer, host])
  const announcement = announceBreadcrumbs(entries)
  if (renderer) {
    return (
      <>
        {renderer(entries)}
        <span className="platform-visually-hidden" aria-live="polite">
          {announcement ? `${announcePrefix} ${announcement}` : ""}
        </span>
      </>
    )
  }
  const items = truncateBreadcrumbs(entries, maxItems)
  const visible = entries.filter((entry) => !entry.hidden)
  const lastKey = visible[visible.length - 1]?.key
  return (
    <Breadcrumb
      className={["platform-breadcrumbs", className].filter(Boolean).join(" ")}
      data-platform-breadcrumbs=""
    >
      <BreadcrumbList>
        {items.map((item) => {
          if ("ellipsis" in item) {
            return (
              <BreadcrumbItem key="ellipsis">
                <BreadcrumbEllipsis
                  title={item.collapsed.map((entry) => entry.label ?? entry.key).join(" › ")}
                />
              </BreadcrumbItem>
            )
          }
          const isCurrent = item.key === lastKey
          const label =
            item.state === "loading"
              ? (item.label ?? "…")
              : item.state === "unavailable"
                ? (item.label ?? "Unavailable")
                : (item.label ?? "Untitled")
          return (
            <BreadcrumbItem
              key={item.key}
              className={`platform-breadcrumb platform-breadcrumb-${item.state} platform-breadcrumb-kind-${item.kind}`}
            >
              {isCurrent || !item.href || item.state !== "ready" ? (
                <BreadcrumbPage
                  aria-busy={item.state === "loading" || undefined}
                  className={item.state !== "ready" ? "platform-breadcrumb-pending" : undefined}
                >
                  {label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink onPress={() => host.navigation.push(item.href!)}>
                  {label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          )
        })}
      </BreadcrumbList>
      <span className="platform-visually-hidden" aria-live="polite">
        {announcement ? `${announcePrefix} ${announcement}` : ""}
      </span>
    </Breadcrumb>
  )
}
