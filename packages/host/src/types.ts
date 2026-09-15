import type {
  BreadcrumbStore,
  CapabilityId,
  CredentialAdapter,
  CommandRegistry,
  CommandState,
  DevInfo,
  Emitter,
  HelpRegistry,
  HostBridge,
  MfeManifest,
  MountHandle,
  NotificationPort,
  OverlayManager,
  PlatformError,
  ReleaseNotesRegistry,
  RemoteDefinition,
  RemoteLoader,
  RuntimeConfig,
  SettingsRegistry,
  ShellContextState,
  ShellContextStore,
  ShellNavigation,
  StorageBackend,
  Telemetry,
  TelemetryAdapter,
  WidgetHandle,
} from "@platform-internal/core"
import type {
  DiagnosticsBus,
  DiagnosticSnapshot,
  ManifestUrlSource,
  RemoteInstanceState,
  SnapshotShareRow,
} from "@platform-internal/diagnostics"

import type { DevtoolsLoader } from "./devtools"
import type { HostFaults } from "./faults"

export type { ManifestUrlSource, RemoteInstanceState }

/** Static registry of remotes known to the shell (the platform registry precedence level). */
export interface RegistryEntry {
  mfeId: string
  /** Manifest URL (absolute or relative to the shell origin). */
  manifestUrl?: string
  displayName?: string
  enabled?: boolean
  /** Preload the entry when the host starts. */
  preload?: boolean
  /** Route prefix owned by the remote when the manifest has not been loaded yet. */
  routePrefix?: string
  /** Hide from the App Finder (the manifest's `discoverable` wins once loaded). */
  discoverable?: boolean
}

export interface HostPolicy {
  /** Approve capabilities for a remote (default: manifest capabilities plus the implicit ones). */
  capabilities?: (manifest: MfeManifest) => CapabilityId[]
  /** Permission groups exposed to remotes (`"all"` or an allow-list). */
  permissionGroups?: "all" | string[]
  /** Extra origins manifests and remote assets may be served from. */
  allowedOrigins?: string[]
  /** Coarse permission preflight against `manifest.permissionGroups` (default true). */
  preflight?: boolean
  /**
   * Origins besides the shell's own that a remote may attach a bearer token to.
   * Anything else is refused before the request is sent.
   */
  credentialOrigins?: string[]
}

export interface DevtoolsOptions {
  policy?: "flag" | "always" | "never"
  environments?: string[]
  /**
   * How the shell loads its developer-tools module, e.g.
   * `() => import("@platform/devtools")`. Without it the tools cannot open.
   * A function, so it never enters the serialisable runtime configuration.
   */
  load?: DevtoolsLoader
}

export interface PlatformHostOptions {
  runtimeConfig: RuntimeConfig
  registry?: RegistryEntry[]
  loader?: RemoteLoader
  navigation: ShellNavigation
  context?: Partial<ShellContextState> | ShellContextStore
  telemetry?: TelemetryAdapter | Telemetry
  storage?: StorageBackend
  notifications?: NotificationPort
  /** Issues access tokens for remotes that were granted the `auth` capability. */
  credentials?: CredentialAdapter
  policy?: HostPolicy
  devtools?: DevtoolsOptions
  overlays?: { baseZIndex?: number; document?: Document }
  environment?: string
  /** Modules the shell shares with remotes when the default loader is used. */
  shared?: Record<
    string,
    { version: string; lib: () => unknown; singleton?: boolean; requiredVersion?: string }
  >
  /** Used by `config.refresh()`; defaults to fetching `/platform-config.json`. */
  refreshRuntimeConfig?: () => Promise<RuntimeConfig>
  /** Default manifest URL for registry entries without one (`/mfes/<mfeId>/platform-manifest.json`). */
  defaultManifestUrl?: (mfeId: string) => string
  /** `fetch` override (tests). */
  fetch?: typeof fetch
  /** Same-origin base (defaults to `window.location.origin`). */
  origin?: string
  /** Query string to read overrides from (defaults to `window.location.search`). */
  search?: string
  /** Sleep override for retry backoff (tests). */
  sleep?: (ms: number) => Promise<void>
  /** Diagnostics ring buffer size. */
  diagnosticsLimit?: number
  /** Skip automatic preloads on creation. */
  autoPreload?: boolean
}

export interface RemoteRecord {
  mfeId: string
  displayName?: string
  registry?: RegistryEntry
  manifest?: MfeManifest
  manifestUrl?: string
  manifestSource?: ManifestUrlSource
  entryUrl?: string
  definition?: RemoteDefinition
  state: RemoteInstanceState
  attempts: number
  error?: PlatformError
  enabled: boolean
  discoverable: boolean
  loaded: boolean
  routePrefix?: string
  dev?: DevInfo
  protocolVersion?: string
  version?: string
  reactVersion?: string
  routerVersion?: string
  instances: string[]
  updatedAt: number
}

export interface InstanceRecord {
  instanceId: string
  mfeId: string
  widgetId?: string
  slot?: string
  routePrefix?: string
  state: RemoteInstanceState
  attempts: number
  error?: PlatformError
  mountedAt?: number
  reactVersion?: string
  routerVersion?: string
}

export interface MountOptions {
  container: HTMLElement
  routePrefix?: string
  instanceId?: string
  slot?: string
  signal?: AbortSignal
  /** Keep the remote's registrations live without showing it (the shell settings page). */
  headless?: boolean
}

export interface WidgetMountOptions {
  container: HTMLElement
  props?: Record<string, unknown>
  instanceId?: string
  slot?: string
  signal?: AbortSignal
}

export interface MountedInstance {
  readonly instanceId: string
  readonly mfeId: string
  readonly bridge: HostBridge
  readonly handle: MountHandle
  readonly state: RemoteInstanceState
  dispose(reason?: "navigation" | "dispose" | "error" | "hmr"): void
}

export interface WidgetInstance extends MountedInstance {
  readonly widgetId: string
  readonly handle: WidgetHandle
  setProps(props: Record<string, unknown>): void
}

export interface ManifestUrlResolution {
  url: string
  source: ManifestUrlSource
}

export interface RemotesApi {
  list(): RemoteRecord[]
  get(mfeId: string): RemoteRecord | undefined
  subscribe(listener: () => void): () => void
  resolveManifestUrl(mfeId: string): ManifestUrlResolution
  setLocalOverride(mfeId: string, url: string | null): void
  localOverrides(): Record<string, string>
  loadManifest(
    mfeId: string,
    options?: { force?: boolean; signal?: AbortSignal }
  ): Promise<MfeManifest>
  load(mfeId: string, options?: { signal?: AbortSignal }): Promise<RemoteDefinition>
  retry(mfeId: string): Promise<RemoteDefinition>
  preload(mfeId: string): Promise<void>
  mount(mfeId: string, options: MountOptions): Promise<MountedInstance>
  mountWidget(
    mfeId: string,
    widgetId: string,
    options: WidgetMountOptions
  ): Promise<WidgetInstance>
  instances(): InstanceRecord[]
  /** Longest route-prefix match over loaded manifests and registry entries. */
  matchRoute(pathname: string): { mfeId: string; routePrefix: string } | null
  sharedReport(mfeId: string): SnapshotShareRow[]
  /** Register or refresh a registry entry at runtime (tests, dynamic registries). */
  register(entry: RegistryEntry): void
  /** Faults the developer tools are currently injecting. */
  faults(): HostFaults
  /**
   * Simulate a failure the shell would otherwise be hard to push into. Ignored
   * unless the developer tools are allowed to load, so production cannot reach
   * it; setting one drops cached definitions so the next load takes the faulted
   * path.
   */
  setFault<K extends keyof HostFaults>(fault: K, value: HostFaults[K]): void
}

export interface HostEvents extends Record<string, unknown> {
  "remote.changed": { mfeId: string }
  "instance.changed": { instanceId: string }
  "config.changed": { config: RuntimeConfig; changes: string[] }
  "command.state": { qualifiedId: string; state: CommandState }
}

export interface CommandRunResult {
  qualifiedId: string
  outcome: "succeeded" | "failed" | "cancelled" | "navigated" | "unknown" | "unavailable"
  durationMs: number
  error?: PlatformError
}

export interface CommandRunner {
  run(
    qualifiedId: string,
    options?: { source?: "palette" | "shortcut" | "api" }
  ): Promise<CommandRunResult>
  abort(qualifiedId: string): boolean
  running(): string[]
}

export interface PlatformHost {
  readonly kind: "shell"
  readonly environment: string
  readonly protocolVersion: string
  readonly config: {
    get(): RuntimeConfig
    subscribe(listener: () => void): () => void
    refresh(): Promise<RuntimeConfig>
  }
  readonly context: ShellContextStore
  /** Read-only, policy-filtered shell context handed to remotes. */
  readonly exposedContext: {
    getState(): ShellContextState
    subscribe(listener: () => void): () => void
  }
  readonly registries: {
    commands: CommandRegistry
    settings: SettingsRegistry
    help: HelpRegistry
    releaseNotes: ReleaseNotesRegistry
  }
  readonly breadcrumbs: BreadcrumbStore
  readonly overlays: OverlayManager
  readonly diagnostics: DiagnosticsBus
  readonly telemetry: Telemetry
  readonly telemetryEvents: () => import("@platform-internal/core").RecordedTelemetryEvent[]
  readonly storage: StorageBackend
  readonly navigation: ShellNavigation
  readonly notifications: NotificationPort | undefined
  readonly credentials: CredentialAdapter | undefined
  readonly loader: RemoteLoader
  readonly remotes: RemotesApi
  readonly commands: CommandRunner
  readonly events: Emitter<HostEvents>
  readonly policy: Required<Pick<HostPolicy, "permissionGroups" | "preflight">> & HostPolicy
  readonly devtools: Required<Pick<DevtoolsOptions, "policy" | "environments">> &
    Pick<DevtoolsOptions, "load">
  /** Subscribe to any host state change (remotes, instances, config). */
  subscribe(listener: () => void): () => void
  snapshot(): DiagnosticSnapshot
  /** Route prefix for an MFE (manifest, registry or default). */
  routePrefixOf(mfeId: string): string
  dispose(): void
}
