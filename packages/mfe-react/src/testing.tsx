import type { ReactNode } from "react"
import {
  createBreadcrumbStore,
  createCommandRegistry,
  createHelpRegistry,
  createInstanceContextStore,
  createInstanceId,
  createMemoryNavigation,
  createMemoryStorageBackend,
  createMemoryTelemetryAdapter,
  createOverlayManager,
  createReleaseNotesRegistry,
  createSettingsRegistry,
  createShellContextStore,
  createTelemetry,
  inferRoutePrefix,
  levelFor,
  PLATFORM_PROTOCOL_VERSION,
  IMPLICIT_CAPABILITIES,
  type CapabilityId,
  type DiagnosticEvent,
  type DiagnosticInput,
  type HostBridge,
  type InstanceContextInput,
  type MountHandle,
  type PlatformUser,
  type RecordedTelemetryEvent,
  type RuntimeEnvValue,
  type ShellContextState,
  deniedCredentialPort,
  type CredentialPort,
  type ShellContextStore,
  type ShellLocation,
  type ShellNavigation,
  type StorageBackend,
  type TokenRequest,
} from "@platform-internal/core"
import { PlatformProvider } from "./provider"
import type { MfeDefinition, MfeEnhancer } from "./types"

export interface TestNotification {
  title: string
  description?: string
  kind?: "info" | "success" | "warning" | "error"
  durationMs?: number
}

export interface CreateTestBridgeOptions {
  mfeId: string
  instanceId?: string
  widgetId?: string
  /** Defaults to `/${mfeId}`; `null` for widget-only bridges. */
  routePrefix?: string | null
  user?: PlatformUser | null
  permissionGroups?: string[]
  env?: Record<string, RuntimeEnvValue>
  sharedEnv?: Record<string, RuntimeEnvValue>
  capabilities?: CapabilityId[]
  /** Provide a navigation implementation; defaults to memory navigation at `initialPath`. */
  navigation?: ShellNavigation
  initialPath?: string
  /** Partial shell context (theme, locale, tenant…). */
  context?: Partial<ShellContextState>
  host?: HostBridge["host"]
  /** Omit the notification port to test the no-op fallback. */
  notifications?: boolean
  /**
   * Access token the credential port hands out. `false` (the default when the
   * `auth` capability is absent) makes every `getToken()` reject with
   * `AUTH_UNAVAILABLE`, which is what an MFE sees in a shell that cannot
   * authenticate it.
   */
  token?: string | false
  /** Origins besides the test origin that `usePlatformFetch` may send a token to. */
  credentialOrigins?: string[]
}

export interface TestBridge extends HostBridge {
  /** Shell context store: `bridge.shell.patch({ theme: "dark" })` updates every subscriber. */
  shell: ShellContextStore
  /** Update the shell context (bumps the revision). */
  setContext(partial: Partial<ShellContextState>): void
  /** Update instance-level context (capabilities, runtime env). */
  setInstance(partial: Partial<InstanceContextInput>): void
  storage: StorageBackend & {
    emitExternal(scope: "local" | "session", key: string, value: string | null): void
  }
  diagnostics: { emit(event: DiagnosticInput): void; events: DiagnosticEvent[]; clear(): void }
  telemetryEvents: RecordedTelemetryEvent[]
  notifications: { notify(notification: TestNotification): void; items: TestNotification[] }
  credentials: CredentialPort & { requests: TokenRequest[] }
  settingsStore: Map<string, { v: number | undefined; value: unknown }>
  dispose(): void
}

/** Build a complete `HostBridge` from the core in-memory implementations. */
export function createTestBridge(options: CreateTestBridgeOptions): TestBridge {
  const { mfeId } = options
  const instanceId = options.instanceId ?? createInstanceId(mfeId, "test")
  const routePrefix =
    options.routePrefix === null ? undefined : (options.routePrefix ?? inferRoutePrefix(mfeId))
  const navigation =
    options.navigation ?? createMemoryNavigation(options.initialPath ?? routePrefix ?? "/")
  const shell = createShellContextStore({
    user:
      options.user === undefined ? { id: "user-1", displayName: "Test User" } : options.user,
    permissionGroups: options.permissionGroups ?? [],
    environment: options.host?.environment ?? "test",
    ...options.context,
  })
  const capabilities = Array.from(
    new Set<CapabilityId>([...IMPLICIT_CAPABILITIES, ...(options.capabilities ?? [])])
  )
  const context = createInstanceContextStore(shell, {
    mfeId,
    instanceId,
    widgetId: options.widgetId,
    capabilities,
    runtime: {
      environment: shell.getState().environment,
      env: options.env ?? {},
      shared: options.sharedEnv ?? {},
    },
  })
  const events: DiagnosticEvent[] = []
  let nextId = 1
  const diagnostics: TestBridge["diagnostics"] = {
    events,
    emit(event) {
      events.push({
        ...event,
        id: nextId++,
        at: Date.now(),
        level: event.level ?? levelFor(event.type),
      } as DiagnosticEvent)
    },
    clear: () => events.splice(0, events.length),
  }
  const adapter = createMemoryTelemetryAdapter()
  const telemetry = createTelemetry({
    adapter,
    context: { mfeId, instanceId, widgetId: options.widgetId, environment: "test" },
  })
  const overlays = createOverlayManager({ diagnostics })
  const settingsStore = new Map<string, { v: number | undefined; value: unknown }>()
  const settingsListeners = new Map<string, Set<() => void>>()
  const notify = (key: string) => {
    for (const listener of Array.from(settingsListeners.get(key) ?? [])) listener()
  }
  const items: TestNotification[] = []
  const tokenRequests: TokenRequest[] = []
  const token = options.token ?? (capabilities.includes("auth") ? "test-token" : false)
  const credentials: TestBridge["credentials"] =
    token === false
      ? Object.assign(
          deniedCredentialPort({
            mfeId,
            cause: capabilities.includes("auth") ? "unconfigured" : "capability",
          }),
          { requests: tokenRequests }
        )
      : {
          requests: tokenRequests,
          allowedOrigins: options.credentialOrigins ?? [],
          getToken(request) {
            tokenRequests.push(request ?? {})
            return Promise.resolve(token)
          },
          subscribe: () => () => {},
        }
  const bridge: TestBridge = {
    protocolVersion: PLATFORM_PROTOCOL_VERSION,
    mfeId,
    instanceId,
    widgetId: options.widgetId,
    routePrefix,
    navigation,
    context,
    capabilities,
    registries: {
      commands: createCommandRegistry(),
      settings: createSettingsRegistry(),
      help: createHelpRegistry(),
      releaseNotes: createReleaseNotesRegistry(),
    },
    breadcrumbs: createBreadcrumbStore(),
    storage: createMemoryStorageBackend(),
    telemetry,
    overlays,
    diagnostics,
    credentials,
    notifications:
      options.notifications === false
        ? (undefined as never)
        : {
            items,
            notify: (notification) => {
              items.push(notification)
            },
          },
    settingsValues: {
      read: (key) => settingsStore.get(key),
      write(key, envelope) {
        settingsStore.set(key, envelope)
        notify(key)
      },
      remove(key) {
        settingsStore.delete(key)
        notify(key)
      },
      subscribe(key, listener) {
        const set = settingsListeners.get(key) ?? new Set()
        settingsListeners.set(key, set)
        set.add(listener)
        return () => {
          set.delete(listener)
        }
      },
    },
    host: options.host ?? { kind: "shell", dev: true, environment: "test" },
    shell,
    setContext: (partial) => shell.patch(partial),
    setInstance: (partial) => context.update(partial),
    telemetryEvents: adapter.events,
    settingsStore,
    dispose: () => overlays.dispose(),
  }
  if (options.notifications === false)
    delete (bridge as { notifications?: unknown }).notifications
  return bridge
}

export interface RenderMfeOptions {
  bridge?: TestBridge
  /** Initial shell path (defaults to the route prefix). */
  path?: string
  container?: HTMLElement
}

export interface RenderMfeResult {
  container: HTMLElement
  bridge: TestBridge
  handle: MountHandle
  navigate(href: string, options?: { replace?: boolean }): void
  location(): ShellLocation
  dispose(): void
}

/** Mount a definition into a jsdom container through the real `mount` path. */
export function renderMfe(
  definition: MfeDefinition,
  options: RenderMfeOptions = {}
): RenderMfeResult {
  const bridge =
    options.bridge ?? createTestBridge({ mfeId: definition.mfeId, initialPath: options.path })
  if (options.bridge && options.path) bridge.navigation.replace(options.path)
  const container = options.container ?? document.createElement("div")
  if (!container.isConnected) document.body.append(container)
  const handle = definition.mount({ container, bridge })
  return {
    container,
    bridge,
    handle,
    navigate: (href, navigateOptions) =>
      navigateOptions?.replace ? bridge.navigation.replace(href) : bridge.navigation.push(href),
    location: () => bridge.navigation.getLocation(),
    dispose() {
      handle.dispose()
      if (!options.container) container.remove()
    },
  }
}

export interface PlatformTestProviderProps {
  bridge: HostBridge
  widgetId?: string
  displayName?: string
  enhancers?: readonly MfeEnhancer[]
  children: ReactNode
}

/** Provide a test bridge to hooks rendered with @testing-library (`wrapper`). */
export function PlatformTestProvider({ children, ...rest }: PlatformTestProviderProps) {
  return <PlatformProvider {...rest}>{children}</PlatformProvider>
}
