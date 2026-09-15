import { Component, useCallback, type ErrorInfo, type ReactNode } from "react"
import { useRouter } from "@tanstack/react-router"
import { isPlatformError, toPlatformError, type PlatformError } from "@platform-internal/core"
import { MountScopeContext } from "./provider"
import type { MountScope } from "./scope"

export interface MfeErrorFallbackProps {
  error: unknown
  reset: () => void
}

export interface MfeErrorBoundaryProps {
  children?: ReactNode
  /** Custom fallback; the default is a Tecton-free, accessible panel with a retry button. */
  fallback?: ReactNode | ((props: MfeErrorFallbackProps) => ReactNode)
  onError?: (error: unknown, info: ErrorInfo) => void
  /** Name reported to telemetry (`boundary` attribute). */
  name?: string
  /** Change this value to reset the boundary from outside. */
  resetKey?: unknown
}

interface MfeErrorBoundaryState {
  error: { value: unknown } | null
  resetKey: unknown
}

/**
 * Isolates rendering failures to this MFE root: the error is reported to
 * telemetry and diagnostics, the fallback offers a retry, the shell keeps
 * running. Class component so it works identically on React 18 and 19.
 */
export class MfeErrorBoundary extends Component<MfeErrorBoundaryProps, MfeErrorBoundaryState> {
  static override contextType = MountScopeContext
  declare context: MountScope | null

  override state: MfeErrorBoundaryState = { error: null, resetKey: undefined }

  static getDerivedStateFromError(error: unknown): Partial<MfeErrorBoundaryState> {
    return { error: { value: error } }
  }

  static getDerivedStateFromProps(
    props: MfeErrorBoundaryProps,
    state: MfeErrorBoundaryState
  ): Partial<MfeErrorBoundaryState> | null {
    if (state.error && state.resetKey !== props.resetKey) {
      return { error: null, resetKey: props.resetKey }
    }
    if (state.resetKey !== props.resetKey) return { resetKey: props.resetKey }
    return null
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const scope = this.context
    const boundary = this.props.name ?? (scope?.kind === "widget" ? "widget" : "mfe")
    if (scope) {
      const owner = {
        mfeId: scope.instance.mfeId,
        instanceId: scope.instance.instanceId,
        widgetId: scope.instance.widgetId,
      }
      const platformError = toPlatformError(error, {
        code: scope.kind === "widget" ? "WIDGET_MOUNT_FAILED" : "MOUNT_FAILED",
        owner,
        source: boundary,
      })
      scope.bridge.telemetry.error(error, {
        boundary,
        componentStack: info.componentStack ?? undefined,
        code: platformError.code,
      })
      scope.bridge.diagnostics.emit({
        type: "error",
        code: platformError.code,
        error: platformError.toJSON(),
        ...owner,
      })
    }
    this.props.onError?.(error, info)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  override render(): ReactNode {
    const caught = this.state.error
    if (!caught) return this.props.children
    const { fallback } = this.props
    if (typeof fallback === "function") return fallback({ error: caught.value, reset: this.reset })
    if (fallback !== undefined) return fallback
    return <MfeErrorFallback error={caught.value} reset={this.reset} />
  }
}

const panelStyle = {
  padding: "1rem",
  border: "1px solid currentColor",
  borderRadius: "0.5rem",
  fontFamily: "inherit",
  maxWidth: "48rem",
} as const

/** Default fallback: plain HTML (no Tecton), with the PlatformError hint and docs link when available. */
export function MfeErrorFallback({ error, reset }: MfeErrorFallbackProps) {
  const platformError: PlatformError | null = isPlatformError(error) ? error : null
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error"
  return (
    <div role="alert" data-platform-error-fallback="" style={panelStyle}>
      <p style={{ margin: 0, fontWeight: 600 }}>Something went wrong in this part of the page.</p>
      <p style={{ margin: "0.5rem 0" }} data-platform-error-message="">
        {platformError ? `[${platformError.code}] ` : ""}
        {message}
      </p>
      {platformError ? (
        <p style={{ margin: "0.5rem 0" }} data-platform-error-hint="">
          {platformError.hint}{" "}
          <a href={platformError.docsUrl} target="_blank" rel="noreferrer">
            Documentation
          </a>
        </p>
      ) : null}
      <button type="button" onClick={reset} data-platform-error-retry="">
        Retry
      </button>
    </div>
  )
}

export interface MfeLoadingProps {
  label?: string
}

/** Accessible loading state used as the default pending component. */
export function MfeLoading({ label = "Loading…" }: MfeLoadingProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" data-platform-loading="">
      <span>{label}</span>
    </div>
  )
}

/** Default TanStack `defaultErrorComponent`: reports through the boundary machinery and retries by invalidating the router. */
export function DefaultRouteErrorComponent({
  error,
  reset,
}: {
  error: unknown
  reset: () => void
}) {
  const router = useRouter({ warn: false })
  const retry = useCallback(() => {
    reset()
    void router?.invalidate()
  }, [reset, router])
  return <MfeErrorFallback error={error} reset={retry} />
}

/** Default TanStack `defaultPendingComponent`. */
export function DefaultPendingComponent() {
  return <MfeLoading />
}

/** Default TanStack `defaultNotFoundComponent`. */
export function DefaultNotFoundComponent() {
  return (
    <div role="alert" data-platform-not-found="" style={panelStyle}>
      <p style={{ margin: 0, fontWeight: 600 }}>Page not found</p>
      <p style={{ margin: "0.5rem 0 0" }}>This MFE has no route for the current URL.</p>
    </div>
  )
}
