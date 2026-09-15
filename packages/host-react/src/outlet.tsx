import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  shallowEqual,
  toPlatformError,
  type MountedInstance,
  type PlatformError,
  type WidgetInstance,
} from "@platform/host"

import { usePlatformHost, useOutletRenderers } from "./context"
import {
  OutletError,
  OutletLoading,
  outletStateFor,
  type OutletErrorProps,
  type OutletLoadingProps,
  type OutletState,
} from "./status"

type Phase =
  { phase: "loading" } | { phase: "mounted" } | { phase: "error"; error: PlatformError }

/** Per-outlet prop, else the provider's renderer, else the structural fallback. */
function useStatusRenderers() {
  const { renderLoading, renderError } = useOutletRenderers()
  return {
    loading: (props: OutletLoadingProps) => (renderLoading ?? OutletLoading)(props),
    error: (props: OutletErrorProps) => (renderError ?? OutletError)(props),
  }
}

export interface MfeOutletProps {
  mfeId: string
  routePrefix?: string
  fallback?: ReactNode
  errorFallback?: (error: PlatformError, retry: () => void) => ReactNode
  className?: string
  /** Keep the remote's registrations live without showing it. */
  headless?: boolean
  onStateChange?: (state: OutletState) => void
}

/**
 * Mounts a route MFE into a shell-owned container. Every failure before or
 * around mounting is rendered here (loading, unavailable, error, permission
 * denied, disabled, restart required) and never leaves the outlet.
 */
export function MfeOutlet({
  mfeId,
  routePrefix,
  fallback,
  errorFallback,
  className,
  headless,
  onStateChange,
}: MfeOutletProps) {
  const host = usePlatformHost()
  const renderers = useStatusRenderers()
  const containerRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>({ phase: "loading" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const controller = new AbortController()
    let cancelled = false
    let instance: MountedInstance | null = null
    setPhase({ phase: "loading" })
    host.remotes
      .mount(mfeId, { container, routePrefix, headless, signal: controller.signal })
      .then((mounted) => {
        if (cancelled) {
          mounted.dispose("navigation")
          return
        }
        instance = mounted
        setPhase({ phase: "mounted" })
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setPhase({
            phase: "error",
            error: toPlatformError(error, { code: "MOUNT_FAILED", owner: { mfeId } }),
          })
      })
    return () => {
      cancelled = true
      controller.abort()
      instance?.dispose("navigation")
    }
  }, [host, mfeId, routePrefix, headless, attempt])

  const retry = useCallback(() => {
    host.remotes.retry(mfeId).catch(() => undefined)
    setAttempt((value) => value + 1)
  }, [host, mfeId])

  const state: OutletState =
    phase.phase === "loading"
      ? "loading"
      : phase.phase === "mounted"
        ? "mounted"
        : outletStateFor(phase.error)
  useEffect(() => {
    onStateChange?.(state)
  }, [state, onStateChange])

  return (
    <div
      data-platform-outlet={mfeId}
      data-platform-outlet-state={state}
      className={["platform-outlet", className].filter(Boolean).join(" ")}
      hidden={headless || undefined}
    >
      <div
        ref={containerRef}
        data-platform-outlet-container=""
        className="platform-outlet-container"
      />
      {phase.phase === "loading" ? (
        <div className="platform-outlet-status">
          {fallback ??
            renderers.loading({
              label: `Loading ${host.remotes.get(mfeId)?.displayName ?? mfeId}…`,
            })}
        </div>
      ) : null}
      {phase.phase === "error" ? (
        <div className="platform-outlet-status">
          {errorFallback
            ? errorFallback(phase.error, retry)
            : renderers.error({ error: phase.error, state, onRetry: retry })}
        </div>
      ) : null}
    </div>
  )
}

export interface WidgetSlotProps {
  mfeId: string
  widgetId: string
  props?: Record<string, unknown>
  slot?: string
  fallback?: ReactNode
  errorFallback?: (error: PlatformError, retry: () => void) => ReactNode
  className?: string
}

/** Mounts one widget instance; prop changes reach the widget through `setProps` (shallow compare). */
export function WidgetSlot({
  mfeId,
  widgetId,
  props,
  slot,
  fallback,
  errorFallback,
  className,
}: WidgetSlotProps) {
  const host = usePlatformHost()
  const renderers = useStatusRenderers()
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<WidgetInstance | null>(null)
  const lastProps = useRef<Record<string, unknown> | undefined>(props)
  const [phase, setPhase] = useState<Phase>({ phase: "loading" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const controller = new AbortController()
    let cancelled = false
    setPhase({ phase: "loading" })
    host.remotes
      .mountWidget(mfeId, widgetId, {
        container,
        props: lastProps.current ?? {},
        slot,
        signal: controller.signal,
      })
      .then((mounted) => {
        if (cancelled) {
          mounted.dispose("navigation")
          return
        }
        instanceRef.current = mounted
        if (lastProps.current && !shallowEqual(lastProps.current, props))
          mounted.setProps(lastProps.current)
        setPhase({ phase: "mounted" })
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setPhase({
            phase: "error",
            error: toPlatformError(error, {
              code: "WIDGET_MOUNT_FAILED",
              owner: { mfeId, widgetId },
            }),
          })
      })
    return () => {
      cancelled = true
      controller.abort()
      instanceRef.current?.dispose("navigation")
      instanceRef.current = null
    }
    // props are pushed through setProps below, not by remounting
  }, [host, mfeId, widgetId, slot, attempt])

  useEffect(() => {
    if (shallowEqual(lastProps.current, props)) return
    lastProps.current = props
    instanceRef.current?.setProps(props ?? {})
  }, [props])

  const retry = useCallback(() => {
    host.remotes.retry(mfeId).catch(() => undefined)
    setAttempt((value) => value + 1)
  }, [host, mfeId])

  const state =
    phase.phase === "loading" ? "loading" : phase.phase === "mounted" ? "mounted" : "error"
  return (
    <div
      data-platform-widget-slot={widgetId}
      data-platform-widget-state={state}
      className={["platform-widget-slot", className].filter(Boolean).join(" ")}
    >
      <div
        ref={containerRef}
        data-platform-widget-container=""
        className="platform-widget-container"
      />
      {phase.phase === "loading" ? (
        <div className="platform-outlet-status">
          {fallback ?? renderers.loading({ label: `Loading ${widgetId}…`, lines: 2 })}
        </div>
      ) : null}
      {phase.phase === "error" ? (
        <div className="platform-outlet-status">
          {errorFallback
            ? errorFallback(phase.error, retry)
            : renderers.error({
                error: phase.error,
                state: outletStateFor(phase.error),
                onRetry: retry,
              })}
        </div>
      ) : null}
    </div>
  )
}
