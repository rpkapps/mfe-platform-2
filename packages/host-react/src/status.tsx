import type { ReactNode } from "react"
import type { PlatformError } from "@platform/host"

export type OutletState =
  "loading" | "mounted" | "error" | "unavailable" | "denied" | "disabled" | "restart-required"

/** Which of the outlet's states an error puts it in. Pure; a shell can render each however it likes. */
export function outletStateFor(error: PlatformError | undefined): OutletState {
  if (!error) return "mounted"
  switch (error.code) {
    case "PERMISSION_DENIED":
      return "denied"
    case "REMOTE_DISABLED":
      return "disabled"
    case "DEV_RESTART_REQUIRED":
      return "restart-required"
    case "MOUNT_FAILED":
    case "WIDGET_MOUNT_FAILED":
    case "WIDGET_UNKNOWN":
    case "INTERNAL":
      return "error"
    default:
      return "unavailable"
  }
}

export const OUTLET_STATE_TITLES: Record<OutletState, string> = {
  loading: "Loading",
  mounted: "",
  error: "This part of the application failed",
  unavailable: "This part of the application is unavailable",
  denied: "You do not have access to this part of the application",
  disabled: "This part of the application is turned off",
  "restart-required": "The development server needs a restart",
}

export interface OutletLoadingProps {
  label?: string
  /** Number of placeholder lines the shell's own renderer may draw. */
  lines?: number
}

export interface OutletErrorProps {
  error: PlatformError
  state: OutletState
  onRetry?: () => void
  retryLabel?: string
  children?: ReactNode
}

/**
 * Renderers a shell can swap out, at the provider for every outlet
 * (`renderLoading` / `renderError`) or per outlet (`fallback` /
 * `errorFallback`).
 */
export interface OutletRenderers {
  renderLoading?: (props: OutletLoadingProps) => ReactNode
  renderError?: (props: OutletErrorProps) => ReactNode
}

/**
 * Structural fallback: no design system, only the `platform-*` classes that
 * `@platform/host-react/styles.css` lays out. It exists so an outlet says
 * something useful before a shell supplies its own renderers — the real chrome
 * is the shell's job.
 */
export function OutletLoading({ label = "Loading…", lines = 3 }: OutletLoadingProps) {
  return (
    <div
      className="platform-outlet-loading"
      role="status"
      aria-label={label}
      data-platform-loading=""
    >
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="platform-outlet-skeleton"
          style={{ width: `${90 - index * 20}%` }}
        />
      ))}
      <span className="platform-visually-hidden">{label}</span>
    </div>
  )
}

/** Structural error fallback; see {@link OutletLoading}. */
export function OutletError({
  error,
  state,
  onRetry,
  retryLabel = "Retry",
  children,
}: OutletErrorProps) {
  const missingGroups = Array.isArray(error.details?.missingGroups)
    ? (error.details.missingGroups as string[])
    : []
  return (
    <div
      role="alert"
      className="platform-outlet-error"
      data-platform-error-code={error.code}
      data-platform-outlet-error-state={state}
    >
      <p className="platform-error-title">
        {OUTLET_STATE_TITLES[state] || OUTLET_STATE_TITLES.error}{" "}
        <code className="platform-error-code">{error.code}</code>
      </p>
      <p>{error.message}</p>
      {missingGroups.length ? (
        <p>Missing permission groups: {missingGroups.join(", ")}</p>
      ) : null}
      <p className="platform-error-hint">{error.hint}</p>
      {error.override ? (
        <p>
          <small>Override: {error.override}</small>
        </p>
      ) : null}
      <p>
        <a
          href={error.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="platform-error-docs"
        >
          Read the documentation
        </a>
      </p>
      {children}
      {onRetry ? (
        <button type="button" onClick={onRetry} data-platform-retry="">
          {retryLabel}
        </button>
      ) : null}
    </div>
  )
}
