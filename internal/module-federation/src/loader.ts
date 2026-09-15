import {
  isProtocolCompatible,
  isRemoteDefinition,
  PlatformError,
  PLATFORM_PROTOCOL_VERSION,
  toPlatformError,
  type DiagnosticSink,
  type MfeManifest,
  type RemoteDefinition,
  type RemoteLoader,
} from "@platform-internal/core"

import type {
  FederationInstance,
  FederationInstanceFactory,
  FederationInstanceOptions,
  FederationRemote,
  FederationSharedInput,
} from "./federation"
import { buildSharedReport, type SharedReportRow } from "./report"
import {
  applySharePolicy,
  hostShareScope,
  type ResolveShareArgs,
  type SharePolicyState,
} from "./share-policy"
import { computeEntryUrl, exposeId, refreshPreambleUrl } from "./urls"

export interface HostSharedModule {
  version: string
  lib: () => unknown
  singleton?: boolean
  /** Range the host accepts from remotes (default `^<version>`). */
  requiredVersion?: string
  /** Override the computed share scope. */
  scope?: string
  eager?: boolean
}

export interface ModuleFederationLoaderOptions {
  name?: string
  /** Modules the shell provides (`react`, `react-dom`, …) with their versions. */
  shared?: Record<string, HostSharedModule>
  diagnostics?: DiagnosticSink
  retry?: { attempts?: number; backoffMs?: number }
  /** Cache-bust entry URLs with `?v=<buildId>` (prod) and `?t=<now>` on retries. */
  cacheBust?: boolean
  /** Runtime factory override (tests, alternative runtimes). */
  createInstance?: FederationInstanceFactory
  /** Dynamic import used for the dev refresh preamble. */
  importModule?: (url: string) => Promise<unknown>
  /** Runtime plugins appended to the platform's own. */
  plugins?: unknown[]
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export interface ModuleFederationLoader extends RemoteLoader {
  readonly instance: FederationInstance
  /** Federation name of a registered remote. */
  federationNameOf(mfeId: string): string | undefined
  sharedReport(mfeId: string): SharedReportRow[]
  invalidate(mfeId: string): void
  preload(manifest: MfeManifest, options: { manifestUrl: string }): Promise<void>
}

interface RegisteredRemote {
  manifest: MfeManifest
  manifestUrl: string
  dev: boolean
  entryUrl: string
  preambleLoaded: boolean
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function defaultCreateInstance(
  options: FederationInstanceOptions
): Promise<FederationInstance> {
  const runtime = await import("@module-federation/runtime")
  return runtime.createInstance(options as never) as unknown as FederationInstance
}

/**
 * Module Federation 2 implementation of the core `RemoteLoader`. Remotes are
 * registered from their manifests, entries are cache-busted, loads retry with
 * backoff, dev remotes get their React Refresh preamble first and shared
 * dependencies resolve inside version groups through a runtime plugin.
 */
export function createModuleFederationLoader(
  options: ModuleFederationLoaderOptions = {}
): ModuleFederationLoader {
  const name = options.name ?? "shell"
  const diagnostics = options.diagnostics
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? defaultSleep
  const attempts = Math.max(0, options.retry?.attempts ?? 2)
  const backoffMs = Math.max(0, options.retry?.backoffMs ?? 500)
  const cacheBust = options.cacheBust ?? true
  const importModule = options.importModule ?? ((url: string) => import(/* @vite-ignore */ url))
  const policy: SharePolicyState = { resolutions: new Map() }
  const registered = new Map<string, RegisteredRemote>()
  const nameToMfeId = new Map<string, string>()

  const shared: Record<string, FederationSharedInput> = {}
  for (const [pkg, module] of Object.entries(options.shared ?? {})) {
    shared[pkg] = {
      version: module.version,
      lib: module.lib,
      loaded: true,
      scope: [module.scope ?? hostShareScope(pkg, module.version)],
      shareConfig: {
        singleton: module.singleton ?? true,
        requiredVersion: module.requiredVersion ?? `^${module.version}`,
        eager: module.eager,
      },
    }
  }

  const sharePlugin = {
    name: "platform-version-groups",
    resolveShare: (args: ResolveShareArgs) => {
      try {
        return applySharePolicy(policy, args, now)
      } catch (error) {
        diagnostics?.emit({
          type: "log",
          message: `share policy failed for ${args.pkgName}`,
          detail: String(error),
          level: "warn",
        })
        return args
      }
    },
    errorLoadRemote: (args: { id: string; error: unknown; lifecycle?: string }) => {
      const mfeId = nameToMfeId.get(String(args.id).split("/")[0] ?? "")
      diagnostics?.emit({
        type: "log",
        level: "warn",
        message: `federation runtime reported an error while loading ${args.id} (${args.lifecycle ?? "unknown"})`,
        detail: args.error instanceof Error ? args.error.message : String(args.error),
        mfeId,
      })
      return undefined
    },
  }

  let instancePromise: Promise<FederationInstance> | null = null
  let instanceSync: FederationInstance | null = null
  const getInstance = (): Promise<FederationInstance> => {
    if (!instancePromise) {
      const instanceOptions: FederationInstanceOptions = {
        name,
        remotes: [],
        shared,
        plugins: [sharePlugin, ...(options.plugins ?? [])],
      }
      instancePromise = options.createInstance
        ? Promise.resolve(options.createInstance(instanceOptions))
        : defaultCreateInstance(instanceOptions)
      instancePromise.then((instance) => {
        instanceSync = instance
      })
    }
    return instancePromise
  }

  const remoteFor = (manifest: MfeManifest, entryUrl: string): FederationRemote => {
    const scopes = new Set<string>(["default"])
    for (const request of manifest.shared) scopes.add(request.scope)
    scopes.add(`react${manifest.runtime.react.major}`)
    return {
      name: manifest.entry.name,
      entry: entryUrl,
      alias: manifest.mfeId,
      type: manifest.entry.type === "var" ? "var" : "module",
      shareScope: Array.from(scopes),
    }
  }

  const register = async (
    manifest: MfeManifest,
    registerOptions: { manifestUrl: string; dev?: boolean; bustNow?: number }
  ) => {
    const dev = registerOptions.dev ?? manifest.dev !== undefined
    const entryUrl = computeEntryUrl(manifest, {
      manifestUrl: registerOptions.manifestUrl,
      dev,
      cacheBust,
      bustNow: registerOptions.bustNow,
    })
    const instance = await getInstance()
    instance.registerRemotes([remoteFor(manifest, entryUrl)], { force: true })
    const previous = registered.get(manifest.mfeId)
    registered.set(manifest.mfeId, {
      manifest,
      manifestUrl: registerOptions.manifestUrl,
      dev,
      entryUrl,
      preambleLoaded: previous?.preambleLoaded ?? false,
    })
    nameToMfeId.set(manifest.entry.name, manifest.mfeId)
    diagnostics?.emit({
      type: "remote.registered",
      loader: "module-federation",
      entryUrl,
      mfeId: manifest.mfeId,
    })
    return entryUrl
  }

  const loadPreamble = async (manifest: MfeManifest, record: RegisteredRemote) => {
    if (record.preambleLoaded) return
    const url = refreshPreambleUrl(manifest, record.manifestUrl)
    if (!url) return
    try {
      await importModule(url)
      record.preambleLoaded = true
      diagnostics?.emit({
        type: "hmr.update",
        kind: "module",
        detail: `refresh preamble installed from ${url}`,
        mfeId: manifest.mfeId,
        level: "debug",
      })
    } catch (error) {
      diagnostics?.emit({
        type: "log",
        level: "warn",
        message: `Could not import the React Refresh preamble for ${manifest.mfeId}; HMR may not work for this remote.`,
        detail: error instanceof Error ? error.message : String(error),
        mfeId: manifest.mfeId,
      })
    }
  }

  const loader: ModuleFederationLoader = {
    name: "module-federation",
    get instance() {
      if (!instanceSync)
        throw new Error(
          "The federation runtime is created on first use; await register() or load() first."
        )
      return instanceSync
    },
    federationNameOf: (mfeId) => registered.get(mfeId)?.manifest.entry.name,
    register: async (manifest, registerOptions) => {
      await register(manifest, registerOptions)
    },
    async load(manifest, loadOptions) {
      const mfeId = manifest.mfeId
      let record = registered.get(mfeId)
      if (
        !record ||
        record.manifestUrl !== loadOptions.manifestUrl ||
        record.manifest !== manifest
      ) {
        await register(manifest, { manifestUrl: loadOptions.manifestUrl })
        record = registered.get(mfeId)!
      }
      if (record.dev) await loadPreamble(manifest, record)
      const id = exposeId(manifest)
      const instance = await getInstance()
      let lastError: PlatformError | undefined
      for (let attempt = 1; attempt <= attempts + 1; attempt += 1) {
        if (loadOptions.signal?.aborted) {
          throw new PlatformError({
            code: "REMOTE_LOAD_FAILED",
            message: `Loading ${mfeId} was aborted.`,
            owner: { mfeId },
            source: record.entryUrl,
            details: { aborted: true },
          })
        }
        const startedAt = now()
        diagnostics?.emit({ type: "remote.loading", entryUrl: record.entryUrl, mfeId })
        try {
          const module = await instance.loadRemote<unknown>(id)
          const candidate = (
            module && typeof module === "object" && "default" in (module as object)
              ? (module as { default: unknown }).default
              : module
          ) as unknown
          if (!isRemoteDefinition(candidate)) {
            throw new PlatformError({
              code: "REMOTE_LOAD_FAILED",
              message: `The module "${id}" of ${mfeId} does not default-export a platform remote definition (createMfe).`,
              owner: { mfeId },
              source: record.entryUrl,
              override: "mfe.config.ts → entry / expose",
              details: { attempt, fatal: true },
            })
          }
          if (!isProtocolCompatible(PLATFORM_PROTOCOL_VERSION, candidate.protocolVersion)) {
            const error = new PlatformError({
              code: "PROTOCOL_INCOMPATIBLE",
              message: `${mfeId} was built for platform protocol ${candidate.protocolVersion}; this host speaks ${PLATFORM_PROTOCOL_VERSION}.`,
              owner: { mfeId },
              source: record.entryUrl,
              details: {
                hostProtocol: PLATFORM_PROTOCOL_VERSION,
                remoteProtocol: candidate.protocolVersion,
              },
            })
            diagnostics?.emit({
              type: "protocol.error",
              code: "PROTOCOL_INCOMPATIBLE",
              error: error.toJSON(),
              mfeId,
            })
            throw error
          }
          diagnostics?.emit({
            type: "remote.loaded",
            durationMs: Math.max(0, now() - startedAt),
            mfeId,
          })
          return candidate as RemoteDefinition
        } catch (error) {
          const platformError = toPlatformError(error, {
            code: "REMOTE_LOAD_FAILED",
            owner: { mfeId },
            source: record.entryUrl,
            override: "manifest override → remote.baseUrl / entry.file",
            details: { attempt },
          })
          lastError = platformError
          diagnostics?.emit({
            type: "remote.failed",
            error: platformError.toJSON(),
            attempt,
            mfeId,
          })
          const fatal =
            platformError.code === "PROTOCOL_INCOMPATIBLE" ||
            platformError.details?.fatal === true
          if (fatal || attempt > attempts) break
          const delay = backoffMs * 2 ** (attempt - 1)
          diagnostics?.emit({
            type: "manifest.retry",
            url: record.entryUrl,
            attempt,
            delayMs: delay,
            mfeId,
            level: "info",
          })
          if (delay > 0) await sleep(delay)
          if (cacheBust) {
            loader.invalidate(mfeId)
            await register(manifest, {
              manifestUrl: loadOptions.manifestUrl,
              dev: record.dev,
              bustNow: now(),
            })
            record = registered.get(mfeId)!
          }
        }
      }
      throw (
        lastError ??
        new PlatformError({
          code: "REMOTE_LOAD_FAILED",
          message: `Could not load ${mfeId}.`,
          owner: { mfeId },
        })
      )
    },
    async preload(manifest, preloadOptions) {
      if (!registered.has(manifest.mfeId))
        await register(manifest, { manifestUrl: preloadOptions.manifestUrl })
      const instance = await getInstance()
      if (!instance.preloadRemote) return
      try {
        await instance.preloadRemote([
          {
            nameOrAlias: manifest.entry.name,
            exposes: [manifest.entry.expose.replace(/^\.\//, "./")],
            resourceCategory: "sync",
          },
        ])
      } catch (error) {
        diagnostics?.emit({
          type: "log",
          level: "warn",
          message: `Preloading ${manifest.mfeId} failed`,
          detail: error instanceof Error ? error.message : String(error),
          mfeId: manifest.mfeId,
        })
      }
    },
    sharedReport(mfeId) {
      const record = registered.get(mfeId)
      if (!record) return []
      const federationName = record.manifest.entry.name
      let shareScopeMap: FederationInstance["shareScopeMap"]
      try {
        shareScopeMap = instanceSync?.shareScopeMap
      } catch {
        shareScopeMap = undefined
      }
      return buildSharedReport({
        manifest: record.manifest,
        federationName,
        recorded: policy.resolutions.get(federationName),
        shareScopeMap,
      })
    },
    invalidate(mfeId) {
      const record = registered.get(mfeId)
      if (!record) return
      const federationName = record.manifest.entry.name
      policy.resolutions.delete(federationName)
      try {
        const cache = instanceSync?.moduleCache
        if (cache) {
          for (const key of Array.from(cache.keys()))
            if (key === federationName || key === mfeId) cache.delete(key)
        }
      } catch {
        // cache shape is runtime-private; ignore
      }
    },
  }
  return loader
}
