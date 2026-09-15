import type { PlatformErrorCode, SerializedPlatformError } from "./errors"

/**
 * Diagnostic events describe everything the platform does with a remote:
 * manifest resolution, loading, negotiation, mounting, registrations,
 * failures. The host records them; devtools show the snapshot and the live
 * stream; telemetry receives a subset.
 */
export type DiagnosticLevel = "debug" | "info" | "warn" | "error"

export interface DiagnosticBase {
  id: number
  at: number
  level: DiagnosticLevel
  mfeId?: string
  instanceId?: string
  widgetId?: string
}

export type DiagnosticEvent = DiagnosticBase &
  (
    | { type: "runtime-config.loaded"; source: string; environment: string }
    | {
        type: "manifest.resolved"
        url: string
        urlSource: "override" | "runtime-config" | "registry" | "default" | "query"
        cacheBusted: boolean
      }
    | {
        type: "manifest.loaded"
        url: string
        version: string
        protocolVersion: string
        dev: boolean
      }
    | { type: "manifest.failed"; url: string; attempt: number; error: SerializedPlatformError }
    | { type: "manifest.retry"; url: string; attempt: number; delayMs: number }
    | { type: "preflight.denied"; missingGroups: string[] }
    | { type: "remote.registered"; loader: string; entryUrl: string }
    | { type: "remote.loading"; entryUrl: string }
    | { type: "remote.loaded"; durationMs: number }
    | { type: "remote.failed"; error: SerializedPlatformError; attempt: number }
    | {
        type: "shared.resolved"
        resolutions: {
          name: string
          scope: string
          requiredVersion: string
          outcome: "shared" | "bundled"
          version?: string
          from?: string
          reason: string
        }[]
      }
    | { type: "mount.started"; container: string }
    | {
        type: "mount.completed"
        durationMs: number
        reactVersion?: string
        routerVersion?: string
      }
    | { type: "mount.failed"; error: SerializedPlatformError }
    | { type: "unmount"; reason: "navigation" | "dispose" | "error" | "hmr" }
    | { type: "widget.mounted"; slot?: string }
    | { type: "widget.unmounted" }
    | { type: "widget.failed"; error: SerializedPlatformError }
    | { type: "route.matched"; pathname: string; routeId: string; guarded: boolean }
    | {
        type: "route.guard"
        routeId: string
        outcome: "allowed" | "redirected" | "rejected"
        detail?: string
      }
    | { type: "route.error"; routeId: string; error: string }
    | {
        type: "registration"
        kind: "command" | "settings" | "help" | "release-notes" | "breadcrumbs"
        action: "added" | "removed"
        key: string
      }
    | { type: "shortcut.conflict"; shortcut: string; holder: string; rejected: string }
    | {
        type: "command.run"
        qualifiedId: string
        outcome: "started" | "succeeded" | "failed" | "cancelled"
        durationMs?: number
        error?: string
      }
    | {
        type: "settings.invalid"
        key: string
        message: string
        recovered: "default" | "migrated" | "none"
      }
    | {
        type: "storage.invalid"
        key: string
        scope: "local" | "session"
        message: string
        recovered: "defaults" | "migrated" | "none"
      }
    | { type: "overlay.opened"; layer: number; ownerAttribute: string }
    | { type: "overlay.closed"; layer: number }
    | {
        type: "hmr.update"
        file?: string
        kind: "module" | "css" | "restart-required"
        detail?: string
      }
    | {
        type: "devtools"
        action: "requested" | "loaded" | "denied" | "failed"
        reason?: string
      }
    | { type: "telemetry.failed"; operation: string; error: string }
    | { type: "protocol.error"; code: PlatformErrorCode; error: SerializedPlatformError }
    | { type: "error"; code: PlatformErrorCode; error: SerializedPlatformError }
    | { type: "log"; message: string; detail?: unknown }
  )

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type DiagnosticInput = DistributiveOmit<DiagnosticEvent, "id" | "at" | "level"> & {
  level?: DiagnosticLevel
  /**
   * The live error behind a serialised `error`, when the emitter has it. Telemetry
   * receives this instance — its class, its cause and the stack from where it was
   * thrown — instead of a reconstruction, and reporting the same instance twice
   * reports it once. It is never recorded: the ring buffer, snapshots and devtools
   * read the serialised `error`, which stays the only persisted form.
   */
  errorInstance?: unknown
}

export interface DiagnosticSink {
  emit(event: DiagnosticInput): void
}

export const noopDiagnostics: DiagnosticSink = { emit: () => {} }

export function levelFor(type: DiagnosticEvent["type"]): DiagnosticLevel {
  if (
    type.endsWith(".failed") ||
    type === "error" ||
    type === "protocol.error" ||
    type === "route.error" ||
    type === "telemetry.failed"
  )
    return "error"
  if (
    type === "shortcut.conflict" ||
    type === "settings.invalid" ||
    type === "storage.invalid" ||
    type === "preflight.denied" ||
    type === "manifest.retry"
  )
    return "warn"
  if (
    type === "log" ||
    type === "route.matched" ||
    type === "overlay.opened" ||
    type === "overlay.closed"
  )
    return "debug"
  return "info"
}
