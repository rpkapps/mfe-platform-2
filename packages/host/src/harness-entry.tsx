import { createRoot, type Root } from "react-dom/client"
import {
  createBrowserNavigation,
  createConsoleTelemetryAdapter,
  parseRuntimeConfig,
  PlatformError,
  validateManifest,
  type CapabilityId,
  type MfeManifest,
  type NavigateOptions,
  type RemoteLoader,
  type RuntimeConfig,
  type RuntimeConfigInput,
  type ShellContextState,
  type ShellNavigation,
} from "@platform-internal/core"

import { HarnessApp } from "./harness/App"
import { createPlatformHost } from "./host"
import { createSonnerNotificationPort } from "./react/notifications"
import type { PlatformHost } from "./types"

export const HARNESS_PREFIX = "/__harness"
export const DEFAULT_MANIFEST_URL = "/platform-manifest.json"

declare global {
  interface Window {
    __PLATFORM_HARNESS__?: { manifestUrl?: string | string[]; basePath?: string; context?: Partial<ShellContextState>; runtimeConfig?: RuntimeConfigInput }
  }
}

export interface HarnessOptions {
  container?: HTMLElement
  /** Manifest URLs to connect (default: `window.__PLATFORM_HARNESS__.manifestUrl`, `?manifest=` or `/platform-manifest.json`). */
  manifestUrls?: string[]
  /** Path prefix the harness is served under (default: detected from `/__platform/harness`). */
  basePath?: string
  context?: Partial<ShellContextState>
  runtimeConfig?: RuntimeConfigInput
  devtools?: boolean
  hostKind?: "shell" | "harness"
}

export interface MountedHarness {
  host: PlatformHost
  lab: FailureLab
  unmount(): void
}

/** Failure simulation switches shared between the loader wrapper, the policy and the UI. */
export interface FailureLab {
  state: { manifest404: Set<string>; droppedCapabilities: Set<CapabilityId>; denyGroups: boolean; incompatibleShared: boolean; unavailable: Set<string> }
  subscribe(listener: () => void): () => void
  notify(): void
}

export function createFailureLab(): FailureLab {
  const listeners = new Set<() => void>()
  return {
    state: { manifest404: new Set(), droppedCapabilities: new Set(), denyGroups: false, incompatibleShared: false, unavailable: new Set() },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    notify() {
      for (const listener of Array.from(listeners)) listener()
    },
  }
}

export function readHarnessManifestUrls(win: Window = window): string[] {
  const configured = win.__PLATFORM_HARNESS__?.manifestUrl
  const fromGlobal = Array.isArray(configured) ? configured : configured ? [configured] : []
  let fromQuery: string[] = []
  try {
    fromQuery = new URLSearchParams(win.location.search).getAll("manifest").flatMap((value) => value.split(","))
  } catch {
    fromQuery = []
  }
  const urls = [...fromGlobal, ...fromQuery].map((url) => url.trim()).filter(Boolean)
  return urls.length ? Array.from(new Set(urls)) : [DEFAULT_MANIFEST_URL]
}

export function detectBasePath(win: Window = window): string {
  const configured = win.__PLATFORM_HARNESS__?.basePath
  if (configured !== undefined) return configured.replace(/\/$/, "")
  const match = /^(.*\/__platform\/harness)(?:\/|$)/.exec(win.location.pathname)
  return match?.[1] ?? ""
}

/** Browser navigation that hides a base path from the shell (harness served under `/__platform/harness/`). */
export function createBasedNavigation(inner: ShellNavigation & { dispose?(): void }, basePath: string): ShellNavigation & { dispose(): void } {
  if (!basePath) return { ...inner, dispose: () => inner.dispose?.() }
  const strip = (pathname: string) => (pathname === basePath ? "/" : pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname)
  const add = (href: string) => (href.startsWith("/") ? `${basePath}${href === "/" ? "" : href}` || "/" : href)
  const map = (location: ReturnType<ShellNavigation["getLocation"]>) => ({ ...location, pathname: strip(location.pathname) })
  return {
    getLocation: () => map(inner.getLocation()),
    push: (href: string, options?: NavigateOptions) => inner.push(add(href), options),
    replace: (href: string, options?: NavigateOptions) => inner.replace(add(href), options),
    back: () => inner.back(),
    forward: () => inner.forward(),
    go: (delta) => inner.go(delta),
    reload: () => inner.reload(),
    subscribe: (listener) => inner.subscribe((location, action) => listener(map(location), action)),
    canLeave: inner.canLeave,
    dispose: () => inner.dispose?.(),
  }
}

/** Loader wrapper applying the failure-lab switches (unavailable remote, incompatible shared requirements). */
export function createLabLoader(inner: RemoteLoader, lab: FailureLab): RemoteLoader {
  const rewrite = (manifest: MfeManifest): MfeManifest => (lab.state.incompatibleShared ? { ...manifest, shared: manifest.shared.map((request) => (request.shared ? { ...request, requiredVersion: "^99.0.0", reason: "pinned" as const } : request)) } : manifest)
  return {
    name: inner.name,
    register: (manifest, options) => inner.register(rewrite(manifest), options),
    async load(manifest, options) {
      if (lab.state.unavailable.has(manifest.mfeId)) {
        throw new PlatformError({ code: "REMOTE_LOAD_FAILED", message: `Failure lab: ${manifest.mfeId} is simulated as unavailable.`, owner: { mfeId: manifest.mfeId }, source: "failure-lab" })
      }
      return inner.load(rewrite(manifest), options)
    },
    preload: inner.preload ? (manifest, options) => inner.preload!(rewrite(manifest), options) : undefined,
    sharedReport: inner.sharedReport ? (mfeId) => inner.sharedReport!(mfeId) : undefined,
    invalidate: inner.invalidate ? (mfeId) => inner.invalidate!(mfeId) : undefined,
  }
}

export const DEFAULT_HARNESS_CONTEXT: Partial<ShellContextState> = {
  user: { id: "u-ada", displayName: "Ada Lovelace", email: "ada@example.com", sessionId: "sess-local" },
  permissionGroups: ["admin", "analysts", "operators"],
  tenant: { id: "acme", name: "Acme Industries" },
  project: { id: "apollo", name: "Apollo" },
  job: { id: "job-42", name: "Nightly sync", status: "running" },
  locale: "en-US",
  timezone: "UTC",
  theme: "system",
  resolvedTheme: "light",
  featureFlags: { "assets.bulk-edit": true, "reports.beta": false },
  environment: "local",
}

/** Connect a manifest URL: fetch it to learn the mfeId, register it and load the manifest through the host. */
export async function connectManifest(host: PlatformHost, url: string): Promise<MfeManifest | null> {
  try {
    const response = await fetch(url, { cache: "no-store" })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const validation = validateManifest(await response.json())
    if (!validation.ok) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "))
    const manifest = validation.manifest
    host.remotes.register({ mfeId: manifest.mfeId, manifestUrl: url, displayName: manifest.displayName })
    return await host.remotes.loadManifest(manifest.mfeId, { force: true })
  } catch (error) {
    host.diagnostics.emit({ type: "log", level: "error", message: `Could not connect manifest ${url}: ${error instanceof Error ? error.message : String(error)}` })
    return null
  }
}

/** Mount the local shell harness into a container (used by the built harness app and programmatically). */
export function mountHarness(options: HarnessOptions = {}): MountedHarness {
  const container = options.container ?? document.getElementById("root") ?? document.body.appendChild(document.createElement("div"))
  const manifestUrls = options.manifestUrls ?? readHarnessManifestUrls()
  const basePath = options.basePath ?? detectBasePath()
  const lab = createFailureLab()
  const origins = manifestUrls.map((url) => {
    try {
      return new URL(url, window.location.href).origin
    } catch {
      return null
    }
  }).filter((origin): origin is string => Boolean(origin))
  let runtimeConfig: RuntimeConfig = parseRuntimeConfig({ environment: "local", devtools: { policy: "always", environments: ["local"] }, allowedOrigins: origins, cache: { manifestMaxAgeSeconds: 0, bustOnRetry: true }, retry: { attempts: 1, backoffMs: 300 }, ...(options.runtimeConfig ?? window.__PLATFORM_HARNESS__?.runtimeConfig ?? {}) }, "harness")
  const navigation = createBasedNavigation(createBrowserNavigation(window), basePath)
  const { createModuleFederationLoader } = harnessLoaderFactory
  const baseLoader = createModuleFederationLoader({ name: "harness", shared: harnessSharedModules(), retry: { attempts: 1, backoffMs: 300 } })
  const host = createPlatformHost({
    hostKind: options.hostKind ?? "harness",
    environment: runtimeConfig.environment,
    runtimeConfig,
    registry: [],
    navigation,
    context: { ...DEFAULT_HARNESS_CONTEXT, ...(window.__PLATFORM_HARNESS__?.context ?? {}), ...(options.context ?? {}) },
    telemetry: createConsoleTelemetryAdapter("[harness telemetry]"),
    notifications: createSonnerNotificationPort(),
    loader: createLabLoader(baseLoader, lab),
    policy: {
      allowedOrigins: origins,
      capabilities: (manifest) => manifest.capabilities.filter((capability) => !lab.state.droppedCapabilities.has(capability)),
    },
    devtools: { policy: options.devtools === false ? "never" : "always", environments: [runtimeConfig.environment] },
    refreshRuntimeConfig: async () => runtimeConfig,
  })
  const setRuntimeConfig = (next: RuntimeConfig) => {
    runtimeConfig = next
    return host.config.refresh()
  }
  const root: Root = createRoot(container)
  root.render(<HarnessApp host={host} lab={lab} manifestUrls={manifestUrls} basePath={basePath} setRuntimeConfig={setRuntimeConfig} />)
  for (const url of manifestUrls) void connectManifest(host, url)
  return {
    host,
    lab,
    unmount() {
      root.unmount()
      host.dispose()
      navigation.dispose()
    },
  }
}

// The harness shares its own React with remotes (React 19 version group).
import * as React from "react"
import * as ReactDom from "react-dom"
import * as ReactDomClient from "react-dom/client"
import * as ReactJsxRuntime from "react/jsx-runtime"
import { createModuleFederationLoader as createMfLoader } from "@platform-internal/module-federation"

const harnessLoaderFactory = { createModuleFederationLoader: createMfLoader }

function harnessSharedModules() {
  const version = React.version
  return {
    react: { version, lib: () => React },
    "react-dom": { version, lib: () => ReactDom },
    "react-dom/client": { version, lib: () => ReactDomClient },
    "react/jsx-runtime": { version, lib: () => ReactJsxRuntime },
  }
}
