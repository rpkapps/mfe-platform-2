import type { ReactNode } from "react"
import type { PlatformError } from "@platform-internal/core"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@tecton/react/components/alert"
import { Button } from "@tecton/react/components/button"
import { Skeleton } from "@tecton/react/components/skeleton"

export type OutletState =
  "loading" | "mounted" | "error" | "unavailable" | "denied" | "disabled" | "restart-required"

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

const TITLES: Record<OutletState, string> = {
  loading: "Loading",
  mounted: "",
  error: "This part of the application failed",
  unavailable: "This part of the application is unavailable",
  denied: "You do not have access to this part of the application",
  disabled: "This part of the application is turned off",
  "restart-required": "The development server needs a restart",
}

export function LoadingState({
  label = "Loading…",
  lines = 3,
}: {
  label?: string
  lines?: number
}) {
  return (
    <div
      className="platform-outlet-loading"
      role="status"
      aria-label={label}
      data-platform-loading=""
    >
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className="platform-outlet-skeleton"
          style={{ width: `${90 - index * 20}%` }}
        />
      ))}
      <span className="platform-visually-hidden">{label}</span>
    </div>
  )
}

export function RemoteErrorState({
  error,
  state,
  onRetry,
  retryLabel = "Retry",
  children,
}: {
  error: PlatformError
  state: OutletState
  onRetry?: () => void
  retryLabel?: string
  children?: ReactNode
}) {
  const variant =
    state === "denied" || state === "disabled"
      ? "warning"
      : state === "restart-required"
        ? "info"
        : "destructive"
  const missingGroups = Array.isArray(error.details?.missingGroups)
    ? (error.details.missingGroups as string[])
    : []
  return (
    <Alert
      variant={variant}
      className="platform-outlet-error"
      data-platform-error-code={error.code}
    >
      <AlertTitle>
        {TITLES[state] || TITLES.error}{" "}
        <code className="platform-error-code">{error.code}</code>
      </AlertTitle>
      <AlertDescription>
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
      </AlertDescription>
      {onRetry ? (
        <AlertAction>
          <Button variant="outline" size="sm" onPress={onRetry} data-platform-retry="">
            {retryLabel}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  )
}
