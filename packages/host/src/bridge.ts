import {
  createInstanceContextStore,
  IMPLICIT_CAPABILITIES,
  PLATFORM_PROTOCOL_VERSION,
  runtimeViewFor,
  shallowEqual,
  type CapabilityId,
  type DiagnosticSink,
  type HostBridge,
  type MfeManifest,
  type NotificationPort,
  type ReadonlyStore,
  type RuntimeConfig,
  type SettingsValuePort,
  type ShellContextState,
  type StorageBackend,
} from "@platform-internal/core"

import type { PlatformHost } from "./types"

export const SETTINGS_STORAGE_PREFIX = "settings"

/** `platform:<mfeId>:settings:<qualifiedKey>` */
export function settingsStorageKey(mfeId: string, qualifiedKey: string): string {
  return `platform:${mfeId}:${SETTINGS_STORAGE_PREFIX}:${qualifiedKey}`
}

/** Settings value port for one MFE, persisted through the shell storage backend. */
export function createSettingsValuePort(storage: StorageBackend, mfeId: string, diagnostics?: DiagnosticSink): SettingsValuePort {
  const key = (qualifiedKey: string) => settingsStorageKey(mfeId, qualifiedKey)
  return {
    read(qualifiedKey) {
      const raw = storage.get("local", key(qualifiedKey))
      if (raw === null) return undefined
      try {
        const parsed = JSON.parse(raw) as { v?: number; value?: unknown }
        if (!parsed || typeof parsed !== "object" || !("value" in parsed)) throw new Error("not an envelope")
        return { v: typeof parsed.v === "number" ? parsed.v : undefined, value: parsed.value }
      } catch (error) {
        diagnostics?.emit({ type: "settings.invalid", key: qualifiedKey, message: `malformed stored value: ${error instanceof Error ? error.message : String(error)}`, recovered: "default", mfeId })
        return undefined
      }
    },
    write(qualifiedKey, envelope) {
      storage.set("local", key(qualifiedKey), JSON.stringify({ v: envelope.v, value: envelope.value, updatedAt: Date.now() }))
    },
    remove(qualifiedKey) {
      storage.remove("local", key(qualifiedKey))
    },
    subscribe(qualifiedKey, listener) {
      return storage.subscribe("local", key(qualifiedKey), () => listener())
    },
  }
}

/** Approved capabilities: the policy's answer, or manifest capabilities plus the implicit set. */
export function approveCapabilities(host: PlatformHost, manifest: MfeManifest): CapabilityId[] {
  const approved = host.policy.capabilities ? host.policy.capabilities(manifest) : [...manifest.capabilities]
  const set = new Set<CapabilityId>([...IMPLICIT_CAPABILITIES, ...approved])
  return Array.from(set)
}

/** Derived read-only shell store whose permission groups follow the host policy. */
export function createExposedContextStore(host: { context: ReadonlyStore<ShellContextState>; policy: { permissionGroups: "all" | string[] } }): ReadonlyStore<ShellContextState> {
  let cachedSource: ShellContextState | null = null
  let cached: ShellContextState | null = null
  const compute = (): ShellContextState => {
    const state = host.context.getState()
    if (cached && cachedSource === state) return cached
    cachedSource = state
    const policy = host.policy.permissionGroups
    cached = policy === "all" ? state : { ...state, permissionGroups: state.permissionGroups.filter((group) => policy.includes(group)) }
    return cached
  }
  const store: ReadonlyStore<ShellContextState> = {
    getState: compute,
    subscribe: (listener) => host.context.subscribe(listener),
    select(selector, listener, equals = shallowEqual) {
      let slice = selector(compute())
      return host.context.subscribe(() => {
        const next = selector(compute())
        if (equals(slice, next)) return
        slice = next
        listener(next)
      })
    },
  }
  return store
}

export interface BridgeInput {
  host: PlatformHost
  manifest: MfeManifest
  instanceId: string
  widgetId?: string
  routePrefix?: string
  capabilities: CapabilityId[]
  runtimeConfig: RuntimeConfig
  diagnostics: DiagnosticSink
  notifications?: NotificationPort
  headless?: boolean
}

export interface BuiltBridge {
  bridge: HostBridge
  contextStore: ReturnType<typeof createInstanceContextStore>
}

/** Build the plain-data bridge handed to a remote on mount. */
export function createBridge(input: BridgeInput): BuiltBridge {
  const { host, manifest, instanceId, widgetId, capabilities } = input
  const mfeId = manifest.mfeId
  const view = runtimeViewFor(input.runtimeConfig, mfeId, manifest.env.keys)
  const contextStore = createInstanceContextStore(host.exposedContext as ReadonlyStore<ShellContextState>, {
    mfeId,
    instanceId,
    widgetId,
    capabilities,
    runtime: { environment: view.environment, env: view.env, shared: view.shared },
    remoteRelease: { version: manifest.version, buildId: manifest.release.buildId, commit: manifest.release.commit },
  })
  const telemetry = host.telemetry.child({ mfeId, instanceId, widgetId, release: manifest.version, environment: host.environment })
  const notifications: NotificationPort | undefined = input.notifications
    ? {
        notify: (notification) => {
          try {
            input.notifications!.notify(notification)
          } catch (error) {
            input.diagnostics.emit({ type: "log", level: "warn", message: "notification port threw", detail: error instanceof Error ? error.message : String(error) })
          }
        },
      }
    : undefined
  const bridge: HostBridge = {
    protocolVersion: PLATFORM_PROTOCOL_VERSION,
    mfeId,
    instanceId,
    widgetId,
    routePrefix: input.routePrefix,
    navigation: host.navigation,
    context: contextStore,
    capabilities,
    registries: host.registries,
    breadcrumbs: host.breadcrumbs,
    storage: host.storage,
    telemetry,
    overlays: host.overlays,
    diagnostics: input.diagnostics,
    notifications,
    settingsValues: createSettingsValuePort(host.storage, mfeId, input.diagnostics),
    host: { kind: host.kind, dev: manifest.dev !== undefined, environment: host.environment, headless: input.headless },
  }
  return { bridge, contextStore }
}
