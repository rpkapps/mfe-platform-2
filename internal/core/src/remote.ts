import type { CapabilityId } from "./capabilities"
import type { InstanceContextState } from "./context"
import type { MfeManifest } from "./manifest"
import type { ShellNavigation } from "./navigation"
import type { CommandRegistry } from "./registrations/commands"
import type { HelpRegistry, ReleaseNotesRegistry } from "./registrations/help"
import type { SettingsRegistry } from "./registrations/settings"
import type { BreadcrumbStore } from "./breadcrumbs"
import type { StorageBackend } from "./storage"
import type { ReadonlyStore } from "./store"
import type { Telemetry } from "./telemetry"
import type { DiagnosticSink } from "./diagnostics"
import type { OverlayManager } from "./overlay"

/**
 * The bridge is what the host hands to a remote when mounting it. It is a
 * plain object of data and functions — no React values, no loader details.
 * Another loader (or a test harness) can build one just as well as Module
 * Federation.
 */
export interface HostBridge {
  protocolVersion: string
  mfeId: string
  instanceId: string
  widgetId?: string
  /** Effective route prefix for this MFE (undefined for widget-only mounts). */
  routePrefix?: string
  navigation: ShellNavigation
  context: ReadonlyStore<InstanceContextState>
  capabilities: readonly CapabilityId[]
  registries: {
    commands: CommandRegistry
    settings: SettingsRegistry
    help: HelpRegistry
    releaseNotes: ReleaseNotesRegistry
  }
  breadcrumbs: BreadcrumbStore
  storage: StorageBackend
  telemetry: Telemetry
  overlays: OverlayManager
  diagnostics: DiagnosticSink
  notifications?: NotificationPort
  /** Settings values persisted by the framework for `managedBy: "framework"` groups. */
  settingsValues: SettingsValuePort
  /** Host environment flags. */
  host: {
    kind: "shell" | "harness"
    dev: boolean
    environment: string
    /** Headless mounts (e.g. a settings owner mounted by the shell settings page) render but do not publish breadcrumbs or become the active route MFE. */
    headless?: boolean
  }
}

export interface NotificationPort {
  notify(notification: {
    title: string
    description?: string
    kind?: "info" | "success" | "warning" | "error"
    durationMs?: number
  }): void
}

export interface SettingsValuePort {
  read(qualifiedKey: string): { v: number | undefined; value: unknown } | undefined
  write(qualifiedKey: string, envelope: { v: number | undefined; value: unknown }): void
  remove(qualifiedKey: string): void
  subscribe(qualifiedKey: string, listener: () => void): () => void
}

/** Returned by a remote's `mount`. */
export interface MountHandle {
  dispose(): void
  /** Called by the host when the bridge context changes in ways that need a re-render (rare; context is a store). */
  update?(): void
}

export interface MountOptions {
  container: HTMLElement
  bridge: HostBridge
}

export interface WidgetMountOptions extends MountOptions {
  widgetId: string
  props: Record<string, unknown>
}

export interface WidgetHandle extends MountHandle {
  /** New props from the host (plain data only). */
  setProps(props: Record<string, unknown>): void
}

/**
 * What the remote's exposed module default-exports (`createMfe(...)`). The
 * host only ever calls these functions.
 */
export interface RemoteDefinition {
  readonly kind: "platform-remote"
  readonly protocolVersion: string
  readonly mfeId: string
  /** Declared widgets by id (metadata only; mounting goes through `mountWidget`). */
  readonly widgets: readonly { id: string; title?: string; description?: string }[]
  /** Whether the remote has a route tree (widget-only libraries do not). */
  readonly hasRoutes: boolean
  mount(options: MountOptions): MountHandle
  mountWidget(options: WidgetMountOptions): WidgetHandle
  /** Static registrations available without mounting (commands that navigate, help links). */
  readonly registrations?: {
    commands?: {
      id: string
      label: string
      description?: string
      group?: string
      keywords?: string[]
      shortcut?: string
      route?: string
      permissionGroups?: string[]
    }[]
    help?: {
      id: string
      title: string
      description?: string
      keywords?: string[]
      href?: string
      route?: string
    }[]
    releaseNotes?: {
      id: string
      version: string
      title: string
      date?: string
      summary?: string
      href?: string
    }[]
  }
}

export function isRemoteDefinition(value: unknown): value is RemoteDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as RemoteDefinition).kind === "platform-remote" &&
    typeof (value as RemoteDefinition).mount === "function"
  )
}

/** Loader abstraction: Module Federation today, anything tomorrow. */
export interface RemoteLoader {
  readonly name: string
  /** Register/refresh the remote in the loader from its manifest. */
  register(
    manifest: MfeManifest,
    options: { manifestUrl: string; dev?: boolean }
  ): Promise<void>
  /** Load the exposed definition module. */
  load(
    manifest: MfeManifest,
    options: { manifestUrl: string; signal?: AbortSignal }
  ): Promise<RemoteDefinition>
  /** Preload the entry without evaluating the definition. */
  preload?(manifest: MfeManifest, options: { manifestUrl: string }): Promise<void>
  /** Shared resolution report for diagnostics. */
  sharedReport?(mfeId: string): {
    name: string
    version?: string
    scope: string
    outcome: "shared" | "bundled"
    from?: string
    reason: string
  }[]
  /** Drop caches so the next load fetches again (dev, retry). */
  invalidate?(mfeId: string): void
}
