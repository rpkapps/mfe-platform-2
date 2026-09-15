import {
  describeCommand,
  isSensitiveKey,
  redactRuntimeConfig,
  type BreadcrumbState,
  type CommandState,
  type DevInfo,
  type DiagnosticEvent,
  type OverlayManagerState,
  type PlatformErrorCode,
  type RecordedTelemetryEvent,
  type RegisteredCommand,
  type RegisteredHelpEntry,
  type RegisteredReleaseNote,
  type RegisteredSettingsGroup,
  type RuntimeConfig,
  type SerializedPlatformError,
  type ShellContextState,
  type ShortcutConflict,
} from "@platform-internal/core"

/** Lifecycle of a remote or of one mounted instance. */
export type RemoteInstanceState =
  | "idle"
  | "resolving"
  | "loading"
  | "negotiating"
  | "mounting"
  | "mounted"
  | "failed"
  | "unavailable"
  | "disposed"

export type ManifestUrlSource = "override" | "runtime-config" | "registry" | "default" | "query"

export interface SnapshotInstance {
  instanceId: string
  mfeId: string
  widgetId?: string
  slot?: string
  state: RemoteInstanceState
  attempts: number
  error?: SerializedPlatformError
  mountedAt?: number
  routePrefix?: string
  reactVersion?: string
  routerVersion?: string
}

export interface SnapshotRemote {
  mfeId: string
  displayName?: string
  state: RemoteInstanceState
  attempts: number
  error?: SerializedPlatformError
  manifestUrl?: string
  manifestSource?: ManifestUrlSource
  entryUrl?: string
  version?: string
  protocolVersion?: string
  reactVersion?: string
  routerVersion?: string
  routePrefix?: string
  discoverable: boolean
  enabled: boolean
  loaded: boolean
  dev?: DevInfo
  instances: SnapshotInstance[]
}

export interface SnapshotShareRow {
  name: string
  scope: string
  requiredVersion?: string
  outcome: "shared" | "bundled"
  version?: string
  from?: string
  reason: string
  group?: string
}

export interface SnapshotRouteMatch {
  mfeId?: string
  instanceId?: string
  pathname: string
  routeId: string
  guarded: boolean
  at: number
  guard?: { outcome: "allowed" | "redirected" | "rejected"; detail?: string }
  error?: string
}

export interface SnapshotInput {
  runtimeConfig: RuntimeConfig
  remotes: SnapshotRemote[]
  /** Share resolution rows per mfeId. */
  shared?: Record<string, SnapshotShareRow[]>
  commands?: RegisteredCommand[]
  shortcutConflicts?: ShortcutConflict[]
  commandStates?: Record<string, CommandState>
  settings?: RegisteredSettingsGroup[]
  breadcrumbs?: BreadcrumbState
  help?: RegisteredHelpEntry[]
  releaseNotes?: RegisteredReleaseNote[]
  context?: ShellContextState
  /** Runtime env views per mfeId (only allow-listed keys). */
  runtimeEnv?: Record<string, Record<string, string | number | boolean>>
  telemetry?: RecordedTelemetryEvent[]
  telemetryLimit?: number
  overlays?: OverlayManagerState
  diagnostics?: DiagnosticEvent[]
  diagnosticsLimit?: number
  host?: { kind: "shell" | "harness"; environment: string; protocolVersion: string }
  now?: number
}

export interface DiagnosticSnapshot {
  readonly version: 1
  readonly createdAt: number
  readonly host: { kind: "shell" | "harness"; environment: string; protocolVersion: string }
  readonly runtimeConfig: RuntimeConfig
  readonly remotes: SnapshotRemote[]
  readonly widgets: SnapshotInstance[]
  readonly routes: SnapshotRouteMatch[]
  readonly shared: Record<string, SnapshotShareRow[]>
  readonly commands: {
    registered: ReturnType<typeof describeCommand>[]
    conflicts: ShortcutConflict[]
    states: Record<string, CommandState>
  }
  readonly settings: {
    qualifiedKey: string
    title: string
    managedBy: "framework" | "mfe"
    route?: string
    owner: { mfeId: string; instanceId: string }
    fields: RegisteredSettingsGroup["fields"]
  }[]
  readonly breadcrumbs: BreadcrumbState
  readonly help: {
    qualifiedId: string
    title: string
    description?: string
    href?: string
    route?: string
    hasContent: boolean
    owner: { mfeId: string; instanceId: string }
  }[]
  readonly releaseNotes: {
    qualifiedId: string
    version: string
    title: string
    date?: string
    summary?: string
    href?: string
    hasContent: boolean
    owner: { mfeId: string; instanceId: string }
  }[]
  readonly session: {
    user: { id: string; displayName: string } | null
    groupsCount: number
    tenant: string | null
    project: string | null
    job: string | null
    locale: string
    timezone: string
    theme: string
    environment: string
    release: ShellContextState["release"]
    revision: number
  }
  readonly runtimeEnv: Record<string, Record<string, string | number | boolean>>
  readonly telemetry: RecordedTelemetryEvent[]
  readonly overlays: {
    roots: OverlayManagerState["roots"]
    layers: { id: number; owner: OverlayManagerState["layers"][number]["owner"]; zIndex: number; openedAt: number }[]
    top: number
  }
  readonly dev: {
    hmrRemotes: string[]
    restartRequired: { mfeId: string; reason?: string }[]
    updates: DiagnosticEvent[]
  }
  readonly protocolErrors: { code: PlatformErrorCode; error: SerializedPlatformError; mfeId?: string; at: number }[]
  readonly boundaryFailures: { type: string; mfeId?: string; instanceId?: string; widgetId?: string; error: SerializedPlatformError; at: number }[]
  readonly diagnostics: DiagnosticEvent[]
}

const tail = <T>(items: readonly T[] | undefined, limit: number): T[] =>
  items ? items.slice(Math.max(0, items.length - limit)) : []

/** Build a read-only, JSON-serialisable snapshot of the host state. */
export function createSnapshot(input: SnapshotInput): DiagnosticSnapshot {
  const diagnostics = tail(input.diagnostics, input.diagnosticsLimit ?? 500)
  const routes = new Map<string, SnapshotRouteMatch>()
  const updates: DiagnosticEvent[] = []
  const protocolErrors: DiagnosticSnapshot["protocolErrors"] = []
  const boundaryFailures: DiagnosticSnapshot["boundaryFailures"] = []
  for (const event of diagnostics) {
    switch (event.type) {
      case "route.matched": {
        const key = `${event.instanceId ?? event.mfeId ?? "?"}:${event.routeId}`
        routes.set(key, {
          mfeId: event.mfeId,
          instanceId: event.instanceId,
          pathname: event.pathname,
          routeId: event.routeId,
          guarded: event.guarded,
          at: event.at,
        })
        break
      }
      case "route.guard": {
        const key = `${event.instanceId ?? event.mfeId ?? "?"}:${event.routeId}`
        const match = routes.get(key)
        if (match) match.guard = { outcome: event.outcome, detail: event.detail }
        else
          routes.set(key, {
            mfeId: event.mfeId,
            instanceId: event.instanceId,
            pathname: "",
            routeId: event.routeId,
            guarded: true,
            at: event.at,
            guard: { outcome: event.outcome, detail: event.detail },
          })
        break
      }
      case "route.error": {
        const key = `${event.instanceId ?? event.mfeId ?? "?"}:${event.routeId}`
        const match = routes.get(key)
        if (match) match.error = event.error
        break
      }
      case "hmr.update":
        updates.push(event)
        break
      case "protocol.error":
        protocolErrors.push({ code: event.code, error: event.error, mfeId: event.mfeId, at: event.at })
        break
      case "mount.failed":
      case "widget.failed":
      case "remote.failed":
      case "manifest.failed":
        boundaryFailures.push({
          type: event.type,
          mfeId: event.mfeId,
          instanceId: event.instanceId,
          widgetId: event.widgetId,
          error: event.error,
          at: event.at,
        })
        break
      case "error":
        boundaryFailures.push({
          type: `error:${event.code}`,
          mfeId: event.mfeId,
          instanceId: event.instanceId,
          widgetId: event.widgetId,
          error: event.error,
          at: event.at,
        })
        if (event.code === "PROTOCOL_INCOMPATIBLE" || event.code === "DEPENDENCY_INCOMPATIBLE") {
          protocolErrors.push({ code: event.code, error: event.error, mfeId: event.mfeId, at: event.at })
        }
        break
      default:
        break
    }
  }
  const context = input.context
  const remotes = input.remotes.map((remote) => ({
    ...remote,
    instances: remote.instances.map((instance) => ({ ...instance })),
  }))
  return {
    version: 1,
    createdAt: input.now ?? Date.now(),
    host: input.host ?? {
      kind: "shell",
      environment: input.runtimeConfig.environment,
      protocolVersion: "1.0",
    },
    runtimeConfig: redactRuntimeConfig(input.runtimeConfig),
    remotes,
    widgets: remotes.flatMap((remote) => remote.instances.filter((instance) => instance.widgetId)),
    routes: Array.from(routes.values()).sort((a, b) => a.at - b.at),
    shared: Object.fromEntries(
      Object.entries(input.shared ?? {}).map(([mfeId, rows]) => [mfeId, rows.map((row) => ({ ...row }))])
    ),
    commands: {
      registered: (input.commands ?? []).map(describeCommand),
      conflicts: [...(input.shortcutConflicts ?? [])],
      states: { ...(input.commandStates ?? {}) },
    },
    settings: (input.settings ?? []).map((group) => ({
      qualifiedKey: group.qualifiedKey,
      title: group.definition.title ?? group.definition.key,
      managedBy: group.definition.managedBy ?? "framework",
      route: group.definition.route,
      owner: { mfeId: group.owner.mfeId, instanceId: group.owner.instanceId },
      fields: group.fields.map((field) => ({ ...field })),
    })),
    breadcrumbs: input.breadcrumbs
      ? {
          shell: [...input.breadcrumbs.shell],
          trails: Object.fromEntries(
            Object.entries(input.breadcrumbs.trails).map(([id, trail]) => [
              id,
              { ...trail, entries: [...trail.entries] },
            ])
          ),
          activeInstanceId: input.breadcrumbs.activeInstanceId,
          renderer: input.breadcrumbs.renderer,
        }
      : { shell: [], trails: {}, activeInstanceId: null, renderer: "shell" },
    help: (input.help ?? []).map((entry) => ({
      qualifiedId: entry.qualifiedId,
      title: entry.definition.title,
      description: entry.definition.description,
      href: entry.definition.href,
      route: entry.definition.route,
      hasContent: entry.definition.content !== undefined,
      owner: { mfeId: entry.owner.mfeId, instanceId: entry.owner.instanceId },
    })),
    releaseNotes: (input.releaseNotes ?? []).map((entry) => ({
      qualifiedId: entry.qualifiedId,
      version: entry.definition.version,
      title: entry.definition.title,
      date: entry.definition.date,
      summary: entry.definition.summary,
      href: entry.definition.href,
      hasContent: entry.definition.content !== undefined,
      owner: { mfeId: entry.owner.mfeId, instanceId: entry.owner.instanceId },
    })),
    session: {
      user: context?.user ? { id: context.user.id, displayName: context.user.displayName } : null,
      groupsCount: context?.permissionGroups.length ?? 0,
      tenant: context?.tenant?.id ?? null,
      project: context?.project?.id ?? null,
      job: context?.job?.id ?? null,
      locale: context?.locale ?? "",
      timezone: context?.timezone ?? "",
      theme: context?.theme ?? "system",
      environment: context?.environment ?? input.runtimeConfig.environment,
      release: { ...(context?.release ?? {}) },
      revision: context?.revision ?? 0,
    },
    runtimeEnv: Object.fromEntries(
      Object.entries(input.runtimeEnv ?? {}).map(([mfeId, env]) => [mfeId, { ...env }])
    ),
    telemetry: tail(input.telemetry, input.telemetryLimit ?? 200).map((event) => ({ ...event })),
    overlays: {
      roots: (input.overlays?.roots ?? []).map((root) => ({ ...root })),
      layers: (input.overlays?.layers ?? []).map((layer) => ({
        id: layer.id,
        owner: layer.owner,
        zIndex: layer.zIndex,
        openedAt: layer.openedAt,
      })),
      top: input.overlays?.top ?? 0,
    },
    dev: {
      hmrRemotes: remotes.filter((remote) => remote.dev?.hmr).map((remote) => remote.mfeId),
      restartRequired: remotes
        .filter((remote) => remote.dev?.restartRequired)
        .map((remote) => ({ mfeId: remote.mfeId, reason: remote.dev?.restartReason })),
      updates,
    },
    protocolErrors,
    boundaryFailures,
    diagnostics,
  }
}

const MASK = "•••"

function maskRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, isSensitiveKey(key) ? MASK : value])
  ) as T
}

function maskAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  return maskRecord(attributes)
}

/**
 * Redact a snapshot for display or export: sensitive-looking keys in runtime
 * config, runtime env and telemetry attributes are masked; the user summary
 * keeps id and display name only; nothing else is added.
 */
export function redactSnapshot(snapshot: DiagnosticSnapshot): DiagnosticSnapshot {
  return {
    ...snapshot,
    runtimeConfig: redactRuntimeConfig(snapshot.runtimeConfig),
    runtimeEnv: Object.fromEntries(
      Object.entries(snapshot.runtimeEnv).map(([mfeId, env]) => [mfeId, maskRecord(env)])
    ),
    telemetry: snapshot.telemetry.map((event) => ({
      ...event,
      attributes: maskAttributes(event.attributes) as RecordedTelemetryEvent["attributes"],
      error: undefined,
    })),
    session: {
      ...snapshot.session,
      user: snapshot.session.user
        ? { id: snapshot.session.user.id, displayName: snapshot.session.user.displayName }
        : null,
    },
    diagnostics: snapshot.diagnostics.map((event) =>
      event.type === "log" && event.detail !== undefined ? { ...event, detail: MASK } : event
    ),
  }
}

/** JSON text of a snapshot (safe: circular or non-serialisable values are replaced). */
export function serializeSnapshot(snapshot: DiagnosticSnapshot, space = 2): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(
    snapshot,
    (_key, value: unknown) => {
      if (typeof value === "function") return "[function]"
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[circular]"
        seen.add(value)
      }
      return value
    },
    space
  )
}
