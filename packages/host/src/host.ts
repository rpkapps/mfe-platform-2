import {
  composeTelemetryAdapters,
  describeCause,
  createBreadcrumbStore,
  createBrowserStorageBackend,
  createCommandRegistry,
  createEmitter,
  createHelpRegistry,
  createInstanceId,
  createMemoryStorageBackend,
  createMemoryTelemetryAdapter,
  createOverlayManager,
  createReleaseNotesRegistry,
  createSettingsRegistry,
  createShellContextStore,
  createStore,
  createTelemetry,
  isPlatformError,
  isProtocolCompatible,
  isUnderPrefix,
  manifestRoutePrefix,
  PlatformError,
  PLATFORM_PROTOCOL_VERSION,
  runtimeViewFor,
  toPlatformError,
  type DiagnosticSink,
  type MfeManifest,
  type MountHandle,
  type RemoteDefinition,
  type RemoteLoader,
  type RuntimeConfig,
  type ShellContextStore,
  type StorageBackend,
  type Telemetry,
  type TelemetryAdapter,
  type WidgetHandle,
} from "@platform-internal/core"

import { ensureRemoteStylesheets } from "./styles-loader"
import {
  createDiagnosticsBus,
  createSnapshot,
  type SnapshotRemote,
} from "@platform-internal/diagnostics"
import { createModuleFederationLoader } from "@platform-internal/module-federation"

import { approveCapabilities, createBridge, createExposedContextStore } from "./bridge"
import { createCommandRunner } from "./commands"
import {
  assertOriginAllowed,
  createOverrideStore,
  defaultManifestUrl,
  fetchManifest,
  originOf,
  resolveManifestUrl,
} from "./manifests"
import { diffRuntimeConfig, loadRuntimeConfig } from "./runtime-config"
import type {
  HostEvents,
  InstanceRecord,
  MountedInstance,
  PlatformHost,
  PlatformHostOptions,
  RegistryEntry,
  RemoteInstanceState,
  RemoteRecord,
  RemotesApi,
  WidgetInstance,
} from "./types"

const UNAVAILABLE_CODES = new Set([
  "REMOTE_DISABLED",
  "PERMISSION_DENIED",
  "MANIFEST_FETCH_FAILED",
  "MANIFEST_INVALID",
  "MANIFEST_ORIGIN_DENIED",
  "PROTOCOL_INCOMPATIBLE",
  "REMOTE_LOAD_FAILED",
  "REMOTE_UNKNOWN",
  "DEV_RESTART_REQUIRED",
  "DEPENDENCY_INCOMPATIBLE",
])

export function stateForError(error: PlatformError): RemoteInstanceState {
  return UNAVAILABLE_CODES.has(error.code) ? "unavailable" : "failed"
}

function isTelemetry(value: TelemetryAdapter | Telemetry): value is Telemetry {
  return (
    typeof (value as Telemetry).child === "function" &&
    typeof (value as Telemetry).span === "function"
  )
}

function isShellStore(value: unknown): value is ShellContextStore {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ShellContextStore).getState === "function" &&
    typeof (value as ShellContextStore).setState === "function"
  )
}

function describeContainer(container: HTMLElement): string {
  const id = container.id ? `#${container.id}` : ""
  const slot = container.getAttribute("data-platform-slot")
  return `${container.tagName.toLowerCase()}${id}${slot ? `[slot=${slot}]` : ""}`
}

const noopSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The shell-side runtime. Framework-free: React bindings live in
 * `@platform/host/react`, the TanStack bridge in `@platform/host/tanstack`.
 */
interface SharedWork<T> {
  /** The shared task; settles once for every caller. */
  promise: Promise<T>
  /** True once every caller gave up and the underlying work was aborted. */
  readonly aborted: boolean
  /** Wait for the task on behalf of one caller; its signal only detaches that caller. */
  join(signal?: AbortSignal): Promise<T>
}

/**
 * One in-flight task shared by every concurrent caller. Each caller waits with its
 * own signal: aborting it rejects that caller alone, and the underlying work is
 * aborted only when every caller has aborted (a caller without a signal keeps it
 * alive). Without this, the first caller's abort (a component unmounting while
 * another mounts the same remote) would fail the load for everyone.
 */
function shareWork<T>(run: (signal: AbortSignal) => Promise<T>): SharedWork<T> {
  const controller = new AbortController()
  let waiting = 0
  let keepAlive = false
  const promise = run(controller.signal)
  // Rejections are observed through `join`; an unobserved shared promise must not
  // surface as an unhandled rejection.
  promise.catch(() => undefined)
  const abortReason = (signal: AbortSignal) =>
    new PlatformError({
      code: "REMOTE_LOAD_FAILED",
      message: "The load was aborted by the caller.",
      cause: signal.reason,
      details: { aborted: true },
    })
  return {
    promise,
    get aborted() {
      return controller.signal.aborted
    },
    join(signal) {
      if (!signal) {
        keepAlive = true
        return promise
      }
      if (signal.aborted) return Promise.reject(abortReason(signal))
      waiting += 1
      return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
          waiting -= 1
          if (waiting === 0 && !keepAlive) controller.abort()
          reject(abortReason(signal))
        }
        signal.addEventListener("abort", onAbort, { once: true })
        promise.then(
          (value) => {
            signal.removeEventListener("abort", onAbort)
            waiting -= 1
            resolve(value)
          },
          (error: unknown) => {
            signal.removeEventListener("abort", onAbort)
            waiting -= 1
            reject(error)
          }
        )
      })
    },
  }
}

export function createPlatformHost(options: PlatformHostOptions): PlatformHost {
  const kind = options.hostKind ?? "shell"
  const configStore = createStore<RuntimeConfig>(options.runtimeConfig)
  const environment = options.environment ?? options.runtimeConfig.environment
  const hasWindow = typeof window !== "undefined"
  const origin = options.origin ?? (hasWindow ? window.location.origin : "http://localhost")
  const sleep = options.sleep ?? noopSleep
  const fetchImpl =
    options.fetch ?? (typeof fetch === "function" ? fetch.bind(globalThis) : undefined)

  // --- context ---------------------------------------------------------
  const context: ShellContextStore = isShellStore(options.context)
    ? options.context
    : createShellContextStore({
        environment,
        release: options.runtimeConfig.release,
        ...(options.context ?? {}),
      })

  // --- telemetry + diagnostics ---------------------------------------------
  const memoryTelemetry = createMemoryTelemetryAdapter({ limit: 500 })
  let telemetry: Telemetry
  if (options.telemetry && isTelemetry(options.telemetry)) {
    // A pre-built telemetry keeps its adapter; the memory stream still records through diagnostics-visible child events.
    telemetry = options.telemetry.child({ environment })
  } else {
    const adapter = options.telemetry
      ? composeTelemetryAdapters(options.telemetry, memoryTelemetry)
      : memoryTelemetry
    telemetry = createTelemetry({
      adapter,
      context: {
        environment,
        release: options.runtimeConfig.release.version,
        sessionId: context.getState().user?.sessionId,
        userId: context.getState().user?.id,
      },
      onAdapterError: (error, operation) =>
        diagnostics.emit({
          type: "telemetry.failed",
          operation,
          error: error instanceof Error ? error.message : String(error),
        }),
    })
  }
  const diagnostics = createDiagnosticsBus({
    limit: options.diagnosticsLimit ?? 1000,
    telemetry,
  })

  // --- storage, overlays, registries, breadcrumbs ---------------------------
  const storage: StorageBackend & { dispose?(): void } =
    options.storage ??
    (hasWindow ? createBrowserStorageBackend(window) : createMemoryStorageBackend())
  const overlays = createOverlayManager({
    baseZIndex: options.overlays?.baseZIndex,
    document: options.overlays?.document,
    diagnostics,
  })
  const registries = {
    commands: createCommandRegistry(),
    settings: createSettingsRegistry(),
    help: createHelpRegistry(),
    releaseNotes: createReleaseNotesRegistry(),
  }
  const breadcrumbs = createBreadcrumbStore()
  const events = createEmitter<HostEvents>()
  registries.commands.events.on("conflict", (conflict) =>
    diagnostics.emit({
      type: "shortcut.conflict",
      shortcut: conflict.shortcut,
      holder: conflict.holder,
      rejected: conflict.rejected,
    })
  )
  registries.commands.events.on("state", (payload) => events.emit("command.state", payload))
  const registrationLog = (
    kind: "command" | "settings" | "help" | "release-notes",
    keys: () => string[]
  ) => {
    let known = new Set(keys())
    return () => {
      const next = new Set(keys())
      for (const key of next)
        if (!known.has(key))
          diagnostics.emit({
            type: "registration",
            kind,
            action: "added",
            key,
            mfeId: key.split(":")[0],
          })
      for (const key of known)
        if (!next.has(key))
          diagnostics.emit({
            type: "registration",
            kind,
            action: "removed",
            key,
            mfeId: key.split(":")[0],
          })
      known = next
    }
  }
  registries.commands.events.on(
    "change",
    registrationLog("command", () => registries.commands.list().map((c) => c.qualifiedId))
  )
  registries.settings.events.on(
    "change",
    registrationLog("settings", () => registries.settings.list().map((g) => g.qualifiedKey))
  )
  registries.help.events.on(
    "change",
    registrationLog("help", () => registries.help.list().map((e) => e.qualifiedId))
  )
  registries.releaseNotes.events.on(
    "change",
    registrationLog("release-notes", () =>
      registries.releaseNotes.list().map((e) => e.qualifiedId)
    )
  )

  // --- policy ------------------------------------------------------------
  const policy: PlatformHost["policy"] = {
    ...options.policy,
    permissionGroups: options.policy?.permissionGroups ?? "all",
    preflight: options.policy?.preflight ?? true,
  }
  const devtools: PlatformHost["devtools"] = {
    policy: options.devtools?.policy ?? options.runtimeConfig.devtools.policy,
    environments: options.devtools?.environments ?? options.runtimeConfig.devtools.environments,
  }

  // --- loader ------------------------------------------------------------
  const loader: RemoteLoader =
    options.loader ??
    createModuleFederationLoader({
      name: "shell",
      shared: options.shared,
      diagnostics,
      retry: {
        attempts: options.runtimeConfig.retry.attempts,
        backoffMs: options.runtimeConfig.retry.backoffMs,
      },
      cacheBust: options.runtimeConfig.cache.bustOnRetry,
    })

  // --- remote records ----------------------------------------------------
  const overrides = createOverrideStore({ storage, search: options.search })
  const records = createStore<Record<string, RemoteRecord>>({})
  const instances = createStore<Record<string, InstanceRecord>>({})
  const definitions = new Map<string, RemoteDefinition>()
  const staticRegistrations = new Map<string, () => void>()
  const loading = new Map<string, SharedWork<RemoteDefinition>>()
  const manifestLoading = new Map<string, SharedWork<MfeManifest>>()
  const mounted = new Map<
    string,
    { dispose(reason?: "navigation" | "dispose" | "error" | "hmr"): void }
  >()
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const listener of Array.from(listeners)) {
      try {
        listener()
      } catch {
        // isolate
      }
    }
  }
  records.subscribe(notify)
  instances.subscribe(notify)
  configStore.subscribe(notify)

  const isEnabled = (
    entry: RegistryEntry | undefined,
    manifest: MfeManifest | undefined,
    mfeId: string
  ) =>
    entry?.enabled !== false &&
    configStore.getState().mfes[mfeId]?.enabled !== false &&
    (manifest?.enabled ?? true)

  const ensureRecord = (mfeId: string): RemoteRecord => {
    const existing = records.getState()[mfeId]
    if (existing) return existing
    const record: RemoteRecord = {
      mfeId,
      state: "idle",
      attempts: 0,
      enabled: isEnabled(undefined, undefined, mfeId),
      discoverable: true,
      loaded: false,
      instances: [],
      updatedAt: Date.now(),
    }
    records.setState((state) => ({ ...state, [mfeId]: record }))
    return record
  }
  const updateRecord = (mfeId: string, patch: Partial<RemoteRecord>) => {
    records.setState((state) => ({
      ...state,
      [mfeId]: { ...(state[mfeId] ?? ensureRecord(mfeId)), ...patch, updatedAt: Date.now() },
    }))
    events.emit("remote.changed", { mfeId })
  }
  const updateInstance = (instanceId: string, patch: Partial<InstanceRecord>) => {
    instances.setState((state) =>
      state[instanceId]
        ? { ...state, [instanceId]: { ...state[instanceId]!, ...patch } }
        : state
    )
    events.emit("instance.changed", { instanceId })
  }
  const registerEntry = (entry: RegistryEntry) => {
    const current = records.getState()[entry.mfeId]
    updateRecord(entry.mfeId, {
      registry: entry,
      displayName: current?.manifest?.displayName ?? entry.displayName ?? current?.displayName,
      enabled: isEnabled(entry, current?.manifest, entry.mfeId),
      discoverable: current?.manifest?.discoverable ?? entry.discoverable ?? true,
      routePrefix: current?.manifest
        ? manifestRoutePrefix(current.manifest)
        : entry.routePrefix,
      state: current?.state ?? "idle",
      attempts: current?.attempts ?? 0,
      loaded: current?.loaded ?? false,
      instances: current?.instances ?? [],
    })
  }
  for (const entry of options.registry ?? []) registerEntry(entry)

  const routePrefixOf = (mfeId: string): string => {
    const record = records.getState()[mfeId]
    if (record?.manifest) return manifestRoutePrefix(record.manifest)
    return record?.registry?.routePrefix ?? `/${mfeId}`
  }

  // --- host object (filled progressively so helpers can reference it) ------
  const host = {
    kind,
    environment,
    protocolVersion: PLATFORM_PROTOCOL_VERSION,
    context,
    registries,
    breadcrumbs,
    overlays,
    diagnostics,
    telemetry,
    telemetryEvents: () => memoryTelemetry.events,
    storage,
    navigation: options.navigation,
    notifications: options.notifications,
    loader,
    events,
    policy,
    devtools,
    routePrefixOf,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  } as PlatformHost
  ;(host as { exposedContext: PlatformHost["exposedContext"] }).exposedContext =
    createExposedContextStore({ context, policy })

  // --- runtime configuration --------------------------------------------
  const applyConfig = (next: RuntimeConfig, source: string) => {
    const previous = configStore.getState()
    const changes = diffRuntimeConfig(previous, next)
    configStore.setState(next)
    for (const change of changes) {
      const match = /^mfes\.([^.]+)(?:\.(.+))?$/.exec(change)
      if (!match) continue
      const mfeId = match[1]!
      const record = records.getState()[mfeId]
      if (!record) continue
      const patch: Partial<RemoteRecord> = {
        enabled: isEnabled(record.registry, record.manifest, mfeId),
      }
      if (match[2] === "manifestUrl") {
        // The manifest location changed: drop the cached manifest and definition so the next load fetches again.
        loader.invalidate?.(mfeId)
        definitions.delete(mfeId)
        staticRegistrations.get(mfeId)?.()
        staticRegistrations.delete(mfeId)
        Object.assign(patch, {
          manifest: undefined,
          manifestUrl: undefined,
          manifestSource: undefined,
          definition: undefined,
          loaded: false,
          state: "idle" as const,
          error: undefined,
        })
      }
      updateRecord(mfeId, patch)
    }
    diagnostics.emit({ type: "runtime-config.loaded", source, environment: next.environment })
    if (changes.length)
      diagnostics.emit({
        type: "log",
        message: `runtime configuration changed: ${changes.join(", ")}`,
        detail: changes,
      })
    events.emit("config.changed", { config: next, changes })
    return next
  }
  ;(host as { config: PlatformHost["config"] }).config = {
    get: configStore.getState,
    subscribe: configStore.subscribe,
    async refresh() {
      const next = await (
        options.refreshRuntimeConfig ??
        (() => loadRuntimeConfig({ fetch: fetchImpl, diagnostics }))
      )()
      return applyConfig(next, next.source ?? "refresh")
    },
  }

  // --- remotes ---------------------------------------------------------
  const registerStatic = (
    mfeId: string,
    definition: RemoteDefinition,
    manifest: MfeManifest
  ) => {
    staticRegistrations.get(mfeId)?.()
    const disposers: (() => void)[] = []
    const owner = {
      mfeId,
      instanceId: `${mfeId}#static`,
      displayName: manifest.displayName ?? mfeId,
    }
    const prefix = manifestRoutePrefix(manifest)
    for (const command of definition.registrations?.commands ?? []) {
      try {
        disposers.push(
          registries.commands.register(
            {
              id: command.id,
              label: command.label,
              description: command.description,
              group: command.group,
              keywords: command.keywords,
              shortcut: command.shortcut,
              permissionGroups: command.permissionGroups,
              route: command.route,
              handler: () => {
                if (command.route)
                  host.navigation.push(
                    `${prefix === "/" ? "" : prefix}${command.route.startsWith("/") ? command.route : `/${command.route}`}`
                  )
              },
            },
            owner
          )
        )
      } catch (error) {
        diagnostics.emit({
          type: "error",
          code: "COMMAND_INVALID",
          error: toPlatformError(error, { code: "COMMAND_INVALID", owner }).toJSON(),
          mfeId,
        })
      }
    }
    for (const entry of definition.registrations?.help ?? []) {
      try {
        disposers.push(
          registries.help.register(
            {
              id: entry.id,
              title: entry.title,
              description: entry.description,
              keywords: entry.keywords,
              href: entry.href,
              route: entry.route,
            },
            owner
          )
        )
      } catch (error) {
        diagnostics.emit({
          type: "log",
          level: "warn",
          message: `static help entry "${entry.id}" of ${mfeId} was rejected`,
          detail: String(error),
          mfeId,
        })
      }
    }
    for (const note of definition.registrations?.releaseNotes ?? []) {
      try {
        disposers.push(
          registries.releaseNotes.register(
            {
              id: note.id,
              version: note.version,
              title: note.title,
              date: note.date,
              summary: note.summary,
              href: note.href,
            },
            owner
          )
        )
      } catch (error) {
        diagnostics.emit({
          type: "log",
          level: "warn",
          message: `static release note "${note.id}" of ${mfeId} was rejected`,
          detail: String(error),
          mfeId,
        })
      }
    }
    staticRegistrations.set(mfeId, () => {
      for (const dispose of disposers) dispose()
    })
  }

  const versionsFor = (mfeId: string, manifest: MfeManifest) => {
    const report = safeSharedReport(mfeId)
    const react = report.find((row) => row.name === "react")
    const router = report.find((row) => row.name === "@tanstack/react-router")
    return {
      reactVersion:
        react?.version ??
        manifest.runtime.react.builtWith ??
        manifest.shared.find((s) => s.name === "react")?.version,
      routerVersion:
        router?.version ??
        manifest.runtime.tanstackRouter?.builtWith ??
        manifest.shared.find((s) => s.name === "@tanstack/react-router")?.version,
    }
  }
  const safeSharedReport = (mfeId: string) => {
    try {
      return (loader.sharedReport?.(mfeId) ?? []).map((row) => ({
        ...row,
        requiredVersion: (row as { requiredVersion?: string }).requiredVersion,
        group: (row as { group?: string }).group ?? row.scope,
      }))
    } catch (error) {
      diagnostics.emit({
        type: "log",
        level: "warn",
        message: `shared report for ${mfeId} failed`,
        detail: String(error),
        mfeId,
      })
      return []
    }
  }

  const loadManifest: RemotesApi["loadManifest"] = async (mfeId, loadOptions = {}) => {
    const record = ensureRecord(mfeId)
    if (record.manifest && !loadOptions.force) return record.manifest
    const pending = manifestLoading.get(mfeId)
    if (pending && !pending.aborted && !loadOptions.force)
      return pending.join(loadOptions.signal)
    const work = shareWork(async (signal) => {
      if (!fetchImpl)
        throw new PlatformError({
          code: "MANIFEST_FETCH_FAILED",
          message: "No fetch implementation is available in this environment.",
          owner: { mfeId },
        })
      const config = configStore.getState()
      const resolved = resolveManifestUrl({
        mfeId,
        overrides,
        runtimeConfig: config,
        registry: record.registry,
        defaultUrl: options.defaultManifestUrl ?? defaultManifestUrl,
      })
      const url = new URL(resolved.url, `${origin}/`).href
      updateRecord(mfeId, {
        state: "resolving",
        manifestUrl: url,
        manifestSource: resolved.source,
        error: undefined,
      })
      diagnostics.emit({
        type: "manifest.resolved",
        url,
        urlSource: resolved.source,
        cacheBusted: false,
        mfeId,
      })
      assertOriginAllowed({
        url,
        mfeId,
        origin,
        runtimeConfig: config,
        registry: record.registry,
        policyOrigins: policy.allowedOrigins,
        kind: "manifest",
      })
      const local = resolved.source === "override" || resolved.source === "query"
      const noStore =
        local || environment !== "production" || config.cache.manifestMaxAgeSeconds === 0
      const result = await fetchManifest({
        url,
        mfeId,
        fetch: fetchImpl,
        attempts: config.retry.attempts,
        backoffMs: config.retry.backoffMs,
        bustOnRetry: config.cache.bustOnRetry,
        noStore,
        signal,
        diagnostics,
        sleep,
      })
      const manifest = result.manifest
      if (!isProtocolCompatible(PLATFORM_PROTOCOL_VERSION, manifest.protocolVersion)) {
        const error = new PlatformError({
          code: "PROTOCOL_INCOMPATIBLE",
          message: `${mfeId} declares platform protocol ${manifest.protocolVersion}; this host speaks ${PLATFORM_PROTOCOL_VERSION}.`,
          owner: { mfeId },
          source: url,
          details: {
            hostProtocol: PLATFORM_PROTOCOL_VERSION,
            remoteProtocol: manifest.protocolVersion,
          },
        })
        diagnostics.emit({
          type: "protocol.error",
          code: "PROTOCOL_INCOMPATIBLE",
          error: error.toJSON(),
          mfeId,
        })
        throw error
      }
      const entryOrigin = originOf(manifest.remote.baseUrl, manifest.dev?.origin ?? url)
      if (entryOrigin && entryOrigin !== originOf(url)) {
        assertOriginAllowed({
          url: new URL(
            manifest.remote.baseUrl,
            manifest.dev?.origin ? `${manifest.dev.origin}/` : url
          ).href,
          mfeId,
          origin,
          runtimeConfig: config,
          registry: record.registry,
          policyOrigins: policy.allowedOrigins,
          manifestOrigins: [
            ...(manifest.remote.allowedOrigins ?? []),
            ...(manifest.dev?.origin ? [manifest.dev.origin] : []),
          ],
          kind: "entry",
        })
      }
      diagnostics.emit({
        type: "manifest.loaded",
        url: result.url,
        version: manifest.version,
        protocolVersion: manifest.protocolVersion,
        dev: manifest.dev !== undefined,
        mfeId,
      })
      updateRecord(mfeId, {
        manifest,
        manifestUrl: url,
        manifestSource: resolved.source,
        displayName: manifest.displayName ?? record.registry?.displayName ?? mfeId,
        discoverable: manifest.discoverable,
        enabled: isEnabled(record.registry, manifest, mfeId),
        routePrefix: manifestRoutePrefix(manifest),
        dev: manifest.dev,
        protocolVersion: manifest.protocolVersion,
        version: manifest.version,
        attempts: record.attempts + result.attempts,
        state: records.getState()[mfeId]?.loaded ? "idle" : "idle",
      })
      if (manifest.dev?.restartRequired)
        diagnostics.emit({
          type: "hmr.update",
          kind: "restart-required",
          detail: manifest.dev.restartReason,
          mfeId,
        })
      return manifest
    })
    manifestLoading.set(mfeId, work)
    // The record reflects the shared task, never one caller's abort: a caller that
    // gives up (a component unmounting) must not fail the load for the others.
    work.promise.catch((error: unknown) => {
      // Every caller gave up: nothing failed, the next caller starts afresh.
      if (work.aborted) {
        if (manifestLoading.get(mfeId) === work) updateRecord(mfeId, { state: "idle" })
        return
      }
      const platformError = toPlatformError(error, {
        code: "MANIFEST_FETCH_FAILED",
        owner: { mfeId },
      })
      updateRecord(mfeId, {
        state: stateForError(platformError),
        error: platformError,
        attempts: (records.getState()[mfeId]?.attempts ?? 0) + 1,
      })
    })
    try {
      return await work.join(loadOptions.signal)
    } catch (error) {
      throw toPlatformError(error, { code: "MANIFEST_FETCH_FAILED", owner: { mfeId } })
    } finally {
      if (manifestLoading.get(mfeId) === work) manifestLoading.delete(mfeId)
    }
  }

  const assertLoadable = (mfeId: string, manifest: MfeManifest) => {
    const record = records.getState()[mfeId]
    if (!isEnabled(record?.registry, manifest, mfeId)) {
      throw new PlatformError({
        code: "REMOTE_DISABLED",
        message: `${mfeId} is disabled.`,
        owner: { mfeId },
        source: record?.manifestUrl,
        override: `mfes.${mfeId}.enabled in the runtime configuration`,
      })
    }
    if (manifest.dev?.restartRequired) {
      throw new PlatformError({
        code: "DEV_RESTART_REQUIRED",
        message: `The development server of ${mfeId} needs a restart${manifest.dev.restartReason ? `: ${manifest.dev.restartReason}` : "."}`,
        owner: { mfeId },
        source: record?.manifestUrl,
        details: { reason: manifest.dev.restartReason, configHash: manifest.dev.configHash },
      })
    }
    if (policy.preflight && manifest.permissionGroups.length) {
      const groups = new Set(context.getState().permissionGroups)
      const missingGroups = manifest.permissionGroups.filter((group) => !groups.has(group))
      if (missingGroups.length) {
        diagnostics.emit({ type: "preflight.denied", missingGroups, mfeId })
        throw new PlatformError({
          code: "PERMISSION_DENIED",
          message: `${mfeId} requires the permission group${missingGroups.length > 1 ? "s" : ""} ${missingGroups.join(", ")}.`,
          owner: { mfeId },
          source: record?.manifestUrl,
          details: { missingGroups, required: manifest.permissionGroups },
        })
      }
    }
  }

  const load: RemotesApi["load"] = async (mfeId, loadOptions = {}) => {
    const cached = definitions.get(mfeId)
    if (cached) {
      // Enablement and preflight are re-evaluated on every load, even for cached definitions.
      const manifest = records.getState()[mfeId]?.manifest
      if (manifest) {
        try {
          assertLoadable(mfeId, manifest)
        } catch (error) {
          const platformError = toPlatformError(error, {
            code: "REMOTE_LOAD_FAILED",
            owner: { mfeId },
          })
          updateRecord(mfeId, { state: stateForError(platformError), error: platformError })
          throw platformError
        }
      }
      return cached
    }
    const pending = loading.get(mfeId)
    if (pending && !pending.aborted) return pending.join(loadOptions.signal)
    const work = shareWork(async (signal) => {
      const manifest = await loadManifest(mfeId, { signal })
      assertLoadable(mfeId, manifest)
      const record = records.getState()[mfeId]!
      updateRecord(mfeId, { state: "loading", error: undefined })
      await loader.register(manifest, {
        manifestUrl: record.manifestUrl!,
        dev: manifest.dev !== undefined,
      })
      const [definition] = await Promise.all([
        loader.load(manifest, { manifestUrl: record.manifestUrl!, signal }),
        ensureRemoteStylesheets(manifest, record.manifestUrl!).catch((error: unknown) => {
          diagnostics.emit({
            type: "log",
            mfeId,
            message: "stylesheet load failed",
            detail: describeCause(error),
          })
          return []
        }),
      ])
      updateRecord(mfeId, { state: "negotiating" })
      const report = safeSharedReport(mfeId)
      if (report.length)
        diagnostics.emit({
          type: "shared.resolved",
          resolutions: report.map((row) => ({
            name: row.name,
            scope: row.scope,
            requiredVersion: row.requiredVersion ?? "*",
            outcome: row.outcome,
            version: row.version,
            from: row.from,
            reason: row.reason,
          })),
          mfeId,
        })
      const incompatible = report.filter(
        (row) =>
          row.outcome === "bundled" && manifest.shared.find((s) => s.name === row.name)?.shared
      )
      for (const row of incompatible) {
        diagnostics.emit({
          type: "log",
          level: "warn",
          message: `${mfeId} uses its bundled copy of ${row.name}${row.version ? `@${row.version}` : ""}: ${row.reason}`,
          mfeId,
        })
      }
      definitions.set(mfeId, definition)
      registerStatic(mfeId, definition, manifest)
      const versions = versionsFor(mfeId, manifest)
      updateRecord(mfeId, { definition, loaded: true, state: "idle", ...versions })
      telemetry.track("mfe.loaded", {
        mfeId,
        version: manifest.version,
        dev: manifest.dev !== undefined,
      })
      return definition
    })
    loading.set(mfeId, work)
    work.promise.catch((error: unknown) => {
      if (work.aborted) {
        if (loading.get(mfeId) === work) updateRecord(mfeId, { state: "idle" })
        return
      }
      const platformError = toPlatformError(error, {
        code: "REMOTE_LOAD_FAILED",
        owner: { mfeId },
      })
      updateRecord(mfeId, { state: stateForError(platformError), error: platformError })
      if (
        platformError.code !== "REMOTE_LOAD_FAILED" &&
        platformError.code !== "MANIFEST_FETCH_FAILED"
      )
        diagnostics.emit({
          type: "error",
          code: platformError.code,
          error: platformError.toJSON(),
          mfeId,
        })
    })
    try {
      return await work.join(loadOptions.signal)
    } catch (error) {
      throw toPlatformError(error, { code: "REMOTE_LOAD_FAILED", owner: { mfeId } })
    } finally {
      if (loading.get(mfeId) === work) loading.delete(mfeId)
    }
  }

  const invalidate = (mfeId: string) => {
    loader.invalidate?.(mfeId)
    definitions.delete(mfeId)
    staticRegistrations.get(mfeId)?.()
    staticRegistrations.delete(mfeId)
    const record = records.getState()[mfeId]
    if (record)
      updateRecord(mfeId, {
        manifest: undefined,
        definition: undefined,
        loaded: false,
        state: "idle",
        error: undefined,
      })
  }

  const disposeInstance = (
    instanceId: string,
    reason: "navigation" | "dispose" | "error" | "hmr",
    handle: MountHandle | undefined,
    container: HTMLElement,
    sink: DiagnosticSink
  ) => {
    const current = instances.getState()[instanceId]
    if (!current || current.state === "disposed") return
    try {
      handle?.dispose()
    } catch (error) {
      sink.emit({
        type: "log",
        level: "warn",
        message: "remote dispose threw",
        detail: error instanceof Error ? error.message : String(error),
      })
      try {
        container.replaceChildren()
      } catch {
        // ignore
      }
    }
    for (const registry of [
      registries.commands,
      registries.settings,
      registries.help,
      registries.releaseNotes,
    ])
      registry.clearOwner(instanceId)
    breadcrumbs.clear(instanceId)
    container.removeAttribute("data-platform-instance")
    mounted.delete(instanceId)
    updateInstance(instanceId, { state: "disposed" })
    updateRecord(current.mfeId, {
      instances: (records.getState()[current.mfeId]?.instances ?? []).filter(
        (id) => id !== instanceId
      ),
      state:
        (records.getState()[current.mfeId]?.instances.length ?? 0) > 1 ? "mounted" : "idle",
    })
    sink.emit(current.widgetId ? { type: "widget.unmounted" } : { type: "unmount", reason })
    telemetry.track(current.widgetId ? "widget.unmounted" : "mfe.unmounted", {
      mfeId: current.mfeId,
      instanceId,
      widgetId: current.widgetId,
      reason,
    })
  }

  const prepareContainer = (
    container: HTMLElement,
    mfeId: string,
    instanceId: string,
    slot?: string
  ) => {
    container.setAttribute("data-mfe", mfeId)
    container.setAttribute("data-platform-instance", instanceId)
    if (slot) container.setAttribute("data-platform-slot", slot)
    if (
      !container.hasAttribute("data-platform-outlet") &&
      !container.hasAttribute("data-platform-widget-slot")
    )
      container.setAttribute("data-platform-container", "")
  }

  const mount: RemotesApi["mount"] = async (mfeId, mountOptions) => {
    const instanceId = mountOptions.instanceId ?? createInstanceId(mfeId, mountOptions.slot)
    const previous = instances.getState()[instanceId]
    const routePrefix = mountOptions.routePrefix ?? routePrefixOf(mfeId)
    instances.setState((state) => ({
      ...state,
      [instanceId]: {
        instanceId,
        mfeId,
        slot: mountOptions.slot,
        routePrefix,
        state: "loading",
        attempts: (previous?.attempts ?? 0) + 1,
        error: undefined,
      },
    }))
    const sink = diagnostics.scoped({ mfeId, instanceId })
    try {
      const definition = await load(mfeId, { signal: mountOptions.signal })
      if (mountOptions.signal?.aborted)
        throw new PlatformError({
          code: "MOUNT_FAILED",
          message: `Mounting ${mfeId} was aborted.`,
          owner: { mfeId, instanceId },
          details: { aborted: true },
        })
      const manifest = records.getState()[mfeId]!.manifest!
      updateInstance(instanceId, { state: "mounting" })
      updateRecord(mfeId, { state: "mounting" })
      const capabilities = approveCapabilities(host, manifest)
      const { bridge } = createBridge({
        host,
        manifest,
        instanceId,
        routePrefix,
        capabilities,
        runtimeConfig: configStore.getState(),
        diagnostics: sink,
        notifications: options.notifications,
        headless: mountOptions.headless,
      })
      prepareContainer(mountOptions.container, mfeId, instanceId, mountOptions.slot)
      sink.emit({ type: "mount.started", container: describeContainer(mountOptions.container) })
      const startedAt = Date.now()
      let handle: MountHandle
      try {
        handle = definition.mount({ container: mountOptions.container, bridge })
        if (!handle || typeof handle.dispose !== "function")
          throw new Error("mount() did not return a handle with dispose()")
      } catch (error) {
        throw toPlatformError(error, {
          code: "MOUNT_FAILED",
          owner: { mfeId, instanceId },
          source: records.getState()[mfeId]?.entryUrl ?? mfeId,
        })
      }
      const versions = versionsFor(mfeId, manifest)
      updateInstance(instanceId, { state: "mounted", mountedAt: Date.now(), ...versions })
      updateRecord(mfeId, {
        state: "mounted",
        instances: [...new Set([...(records.getState()[mfeId]?.instances ?? []), instanceId])],
        ...versions,
      })
      if (!mountOptions.headless) breadcrumbs.setActive(instanceId)
      if (mountOptions.headless)
        mountOptions.container.setAttribute("data-platform-headless", "")
      sink.emit({
        type: "mount.completed",
        durationMs: Date.now() - startedAt,
        reactVersion: versions.reactVersion,
        routerVersion: versions.routerVersion,
      })
      telemetry.track("mfe.mounted", {
        mfeId,
        instanceId,
        routePrefix,
        headless: Boolean(mountOptions.headless),
        durationMs: Date.now() - startedAt,
      })
      const instance: MountedInstance = {
        instanceId,
        mfeId,
        bridge,
        handle,
        get state() {
          return instances.getState()[instanceId]?.state ?? "disposed"
        },
        dispose: (reason = "dispose") =>
          disposeInstance(instanceId, reason, handle, mountOptions.container, sink),
      }
      mounted.set(instanceId, instance)
      return instance
    } catch (error) {
      const platformError = toPlatformError(error, {
        code: "MOUNT_FAILED",
        owner: { mfeId, instanceId },
      })
      if (platformError.details?.aborted) {
        // The caller gave up (its container unmounted): nothing failed.
        updateInstance(instanceId, { state: "disposed" })
        sink.emit({
          type: "log",
          level: "debug",
          message: `mount of ${mfeId} aborted by the caller`,
        })
        throw platformError
      }
      updateInstance(instanceId, { state: stateForError(platformError), error: platformError })
      sink.emit({ type: "mount.failed", error: platformError.toJSON() })
      telemetry.error(platformError, { mfeId, instanceId, boundary: "mount" })
      throw platformError
    }
  }

  const mountWidget: RemotesApi["mountWidget"] = async (mfeId, widgetId, mountOptions) => {
    const instanceId =
      mountOptions.instanceId ??
      createInstanceId(
        mfeId,
        mountOptions.slot ? `${widgetId}:${mountOptions.slot}` : undefined
      )
    const previous = instances.getState()[instanceId]
    instances.setState((state) => ({
      ...state,
      [instanceId]: {
        instanceId,
        mfeId,
        widgetId,
        slot: mountOptions.slot,
        state: "loading",
        attempts: (previous?.attempts ?? 0) + 1,
        error: undefined,
      },
    }))
    const sink = diagnostics.scoped({ mfeId, instanceId, widgetId })
    let props = { ...(mountOptions.props ?? {}) }
    try {
      const definition = await load(mfeId, { signal: mountOptions.signal })
      if (mountOptions.signal?.aborted)
        throw new PlatformError({
          code: "WIDGET_MOUNT_FAILED",
          message: `Mounting widget ${widgetId} of ${mfeId} was aborted.`,
          owner: { mfeId, instanceId, widgetId },
          details: { aborted: true },
        })
      const manifest = records.getState()[mfeId]!.manifest!
      if (!definition.widgets.some((widget) => widget.id === widgetId)) {
        throw new PlatformError({
          code: "WIDGET_UNKNOWN",
          message: `${mfeId} does not expose a widget "${widgetId}" (known: ${definition.widgets.map((w) => w.id).join(", ") || "none"}).`,
          owner: { mfeId, instanceId, widgetId },
          source: widgetId,
        })
      }
      updateInstance(instanceId, { state: "mounting" })
      const capabilities = approveCapabilities(host, manifest)
      const { bridge } = createBridge({
        host,
        manifest,
        instanceId,
        widgetId,
        capabilities,
        runtimeConfig: configStore.getState(),
        diagnostics: sink,
        notifications: options.notifications,
      })
      prepareContainer(mountOptions.container, mfeId, instanceId, mountOptions.slot)
      mountOptions.container.setAttribute("data-platform-widget", widgetId)
      sink.emit({ type: "mount.started", container: describeContainer(mountOptions.container) })
      const startedAt = Date.now()
      let handle: WidgetHandle
      try {
        handle = definition.mountWidget({
          container: mountOptions.container,
          bridge,
          widgetId,
          props,
        })
        if (!handle || typeof handle.dispose !== "function")
          throw new Error("mountWidget() did not return a handle with dispose()")
      } catch (error) {
        throw toPlatformError(error, {
          code: "WIDGET_MOUNT_FAILED",
          owner: { mfeId, instanceId, widgetId },
          source: widgetId,
        })
      }
      const versions = versionsFor(mfeId, manifest)
      updateInstance(instanceId, { state: "mounted", mountedAt: Date.now(), ...versions })
      updateRecord(mfeId, {
        state: "mounted",
        instances: [...new Set([...(records.getState()[mfeId]?.instances ?? []), instanceId])],
        ...versions,
      })
      sink.emit({ type: "widget.mounted", slot: mountOptions.slot })
      sink.emit({
        type: "mount.completed",
        durationMs: Date.now() - startedAt,
        reactVersion: versions.reactVersion,
        routerVersion: versions.routerVersion,
      })
      telemetry.track("widget.mounted", {
        mfeId,
        instanceId,
        widgetId,
        slot: mountOptions.slot,
      })
      const instance: WidgetInstance = {
        instanceId,
        mfeId,
        widgetId,
        bridge,
        handle,
        get state() {
          return instances.getState()[instanceId]?.state ?? "disposed"
        },
        setProps(next) {
          props = { ...next }
          try {
            handle.setProps(props)
          } catch (error) {
            const platformError = toPlatformError(error, {
              code: "WIDGET_MOUNT_FAILED",
              owner: { mfeId, instanceId, widgetId },
              source: widgetId,
            })
            sink.emit({ type: "widget.failed", error: platformError.toJSON() })
            updateInstance(instanceId, { state: "failed", error: platformError })
          }
        },
        dispose: (reason = "dispose") =>
          disposeInstance(instanceId, reason, handle, mountOptions.container, sink),
      }
      mounted.set(instanceId, instance)
      return instance
    } catch (error) {
      const platformError = toPlatformError(error, {
        code: "WIDGET_MOUNT_FAILED",
        owner: { mfeId, instanceId, widgetId },
      })
      if (platformError.details?.aborted) {
        updateInstance(instanceId, { state: "disposed" })
        sink.emit({
          type: "log",
          level: "debug",
          message: `mount of widget ${widgetId} of ${mfeId} aborted by the caller`,
        })
        throw platformError
      }
      updateInstance(instanceId, { state: stateForError(platformError), error: platformError })
      sink.emit({ type: "widget.failed", error: platformError.toJSON() })
      telemetry.error(platformError, { mfeId, instanceId, widgetId, boundary: "widget" })
      throw platformError
    }
  }

  const remotes: RemotesApi = {
    list: () => Object.values(records.getState()),
    get: (mfeId) => records.getState()[mfeId],
    subscribe: (listener) => {
      const a = records.subscribe(listener)
      const b = instances.subscribe(listener)
      return () => {
        a()
        b()
      }
    },
    resolveManifestUrl: (mfeId) => {
      const resolved = resolveManifestUrl({
        mfeId,
        overrides,
        runtimeConfig: configStore.getState(),
        registry: records.getState()[mfeId]?.registry,
        defaultUrl: options.defaultManifestUrl ?? defaultManifestUrl,
      })
      return { url: new URL(resolved.url, `${origin}/`).href, source: resolved.source }
    },
    setLocalOverride(mfeId, url) {
      overrides.setLocal(mfeId, url)
      invalidate(mfeId)
      diagnostics.emit({
        type: "log",
        message: url
          ? `manifest override set for ${mfeId}: ${url}`
          : `manifest override cleared for ${mfeId}`,
        mfeId,
      })
    },
    localOverrides: () => ({ ...overrides.local(), ...overrides.query() }),
    loadManifest,
    load,
    async retry(mfeId) {
      invalidate(mfeId)
      return load(mfeId)
    },
    async preload(mfeId) {
      const manifest = await loadManifest(mfeId)
      const record = records.getState()[mfeId]!
      if (!isEnabled(record.registry, manifest, mfeId)) return
      await loader.register(manifest, {
        manifestUrl: record.manifestUrl!,
        dev: manifest.dev !== undefined,
      })
      await loader.preload?.(manifest, { manifestUrl: record.manifestUrl! })
    },
    mount,
    mountWidget,
    instances: () => Object.values(instances.getState()),
    matchRoute(pathname) {
      let best: { mfeId: string; routePrefix: string } | null = null
      for (const record of Object.values(records.getState())) {
        if (
          record.manifest &&
          (record.manifest.kind === "widget-library" ||
            (record.definition && !record.definition.hasRoutes))
        )
          continue
        const prefix = routePrefixOf(record.mfeId)
        if (!isUnderPrefix(pathname, prefix)) continue
        if (!best || prefix.length > best.routePrefix.length)
          best = { mfeId: record.mfeId, routePrefix: prefix }
      }
      return best
    },
    sharedReport: safeSharedReport,
    register: registerEntry,
  }
  ;(host as { remotes: RemotesApi }).remotes = remotes
  ;(host as { commands: PlatformHost["commands"] }).commands = createCommandRunner(host)

  ;(host as { snapshot: PlatformHost["snapshot"] }).snapshot = () => {
    const config = configStore.getState()
    const instanceList = Object.values(instances.getState())
    const remoteRows: SnapshotRemote[] = Object.values(records.getState()).map((record) => ({
      mfeId: record.mfeId,
      displayName: record.displayName,
      state: record.state,
      attempts: record.attempts,
      error: record.error?.toJSON(),
      manifestUrl: record.manifestUrl,
      manifestSource: record.manifestSource,
      entryUrl: record.entryUrl,
      version: record.version,
      protocolVersion: record.protocolVersion,
      reactVersion: record.reactVersion,
      routerVersion: record.routerVersion,
      routePrefix: record.routePrefix ?? routePrefixOf(record.mfeId),
      discoverable: record.discoverable,
      enabled: record.enabled,
      loaded: record.loaded,
      dev: record.dev,
      instances: instanceList
        .filter((instance) => instance.mfeId === record.mfeId)
        .map((instance) => ({ ...instance, error: instance.error?.toJSON() })),
    }))
    return createSnapshot({
      runtimeConfig: config,
      remotes: remoteRows,
      shared: Object.fromEntries(
        remoteRows
          .filter((row) => row.loaded)
          .map((row) => [row.mfeId, safeSharedReport(row.mfeId)])
      ),
      commands: registries.commands.list(),
      shortcutConflicts: registries.commands.conflicts(),
      commandStates: registries.commands.states(),
      settings: registries.settings.list(),
      breadcrumbs: breadcrumbs.getState(),
      help: registries.help.list(),
      releaseNotes: registries.releaseNotes.list(),
      context: context.getState(),
      runtimeEnv: Object.fromEntries(
        remoteRows.map((row) => [
          row.mfeId,
          runtimeViewFor(config, row.mfeId, records.getState()[row.mfeId]?.manifest?.env.keys)
            .env,
        ])
      ),
      telemetry: memoryTelemetry.events,
      overlays: overlays.getState(),
      diagnostics: diagnostics.list(),
      host: { kind, environment, protocolVersion: PLATFORM_PROTOCOL_VERSION },
    })
  }

  ;(host as { dispose: PlatformHost["dispose"] }).dispose = () => {
    for (const instance of Array.from(mounted.values())) {
      try {
        instance.dispose("dispose")
      } catch {
        // isolate
      }
    }
    for (const dispose of staticRegistrations.values()) dispose()
    staticRegistrations.clear()
    overlays.dispose()
    storage.dispose?.()
    listeners.clear()
  }

  diagnostics.emit({
    type: "runtime-config.loaded",
    source: options.runtimeConfig.source ?? "static",
    environment,
  })

  if (options.autoPreload !== false) {
    queueMicrotask(() => {
      for (const record of Object.values(records.getState())) {
        const policyPreload = configStore.getState().mfes[record.mfeId]?.preload
        const wanted =
          record.registry?.preload || policyPreload === "entry" || policyPreload === "eager"
        if (!wanted || !record.enabled) continue
        const task =
          policyPreload === "eager"
            ? load(record.mfeId).then(() => undefined)
            : remotes.preload(record.mfeId)
        task.catch((error) => {
          if (!isPlatformError(error))
            diagnostics.emit({
              type: "log",
              level: "warn",
              message: `preload of ${record.mfeId} failed`,
              detail: String(error),
              mfeId: record.mfeId,
            })
        })
      }
    })
  }

  return host
}
