import { vi } from "vitest"
import {
  createMemoryNavigation,
  createMemoryStorageBackend,
  parseRuntimeConfig,
  validateManifest,
  type MfeManifest,
  type MfeManifestInput,
  type MountHandle,
  type RemoteDefinition,
  type RemoteLoader,
  type RuntimeConfigInput,
  type WidgetHandle,
} from "@platform-internal/core"

import { createPlatformHost } from "../src/host"
import type { PlatformHostOptions, RegistryEntry } from "../src/types"

export const ORIGIN = "http://shell.test"

export function manifest(overrides: Partial<MfeManifestInput> = {}): MfeManifest {
  const input: MfeManifestInput = {
    mfeId: "asset-tracker",
    version: "1.2.3",
    displayName: "Asset tracker",
    release: { version: "1.2.3", buildId: "b1" },
    entry: {
      loader: "module-federation",
      name: "mfe_asset_tracker",
      file: "remoteEntry.js",
      expose: "./mfe",
      type: "module",
    },
    remote: { baseUrl: "./", preload: "none" },
    runtime: {
      react: { requiredVersion: "^19.0.0", major: 19, builtWith: "19.3.0" },
      tanstackRouter: { requiredVersion: "^1.170.0", builtWith: "1.170.36" },
    },
    navigation: {
      title: "Assets",
      description: "Track assets",
      keywords: ["pump", "inventory"],
    },
    routes: [
      {
        path: "/assets/$assetId",
        fullPath: "/asset-tracker/assets/$assetId",
        file: "assets.$assetId.tsx",
        navigation: { title: "Asset details", keywords: ["asset"] },
      },
    ],
    capabilities: ["commands", "settings"],
    widgets: [{ id: "asset-card", title: "Asset card" }],
    env: {
      keys: {
        API_BASE_URL: { required: true, default: "https://api.default" },
        FEATURE_X: { default: false },
      },
    },
    ...overrides,
  }
  const result = validateManifest(input)
  if (!result.ok) throw new Error(JSON.stringify(result.issues))
  return result.manifest
}

export interface FakeDefinitionOptions {
  mfeId?: string
  protocolVersion?: string
  onMount?: (options: {
    container: HTMLElement
    bridge: import("@platform-internal/core").HostBridge
  }) => void
  throwOnMount?: boolean
  widgets?: string[]
}

export function definition(options: FakeDefinitionOptions = {}): RemoteDefinition & {
  mounts: number
  disposed: number
  lastBridge?: import("@platform-internal/core").HostBridge
  lastProps?: Record<string, unknown>
} {
  const def = {
    kind: "platform-remote" as const,
    protocolVersion: options.protocolVersion ?? "1.0",
    mfeId: options.mfeId ?? "asset-tracker",
    widgets: (options.widgets ?? ["asset-card"]).map((id) => ({ id })),
    hasRoutes: true,
    mounts: 0,
    disposed: 0,
    lastBridge: undefined as import("@platform-internal/core").HostBridge | undefined,
    lastProps: undefined as Record<string, unknown> | undefined,
    registrations: {
      commands: [{ id: "go-assets", label: "Go to assets", route: "/assets" }],
      help: [{ id: "intro", title: "Getting started" }],
    },
    mount(mountOptions: {
      container: HTMLElement
      bridge: import("@platform-internal/core").HostBridge
    }): MountHandle {
      def.mounts += 1
      def.lastBridge = mountOptions.bridge
      options.onMount?.(mountOptions)
      if (options.throwOnMount) throw new Error("mount exploded")
      mountOptions.container.textContent = `mounted ${mountOptions.bridge.instanceId}`
      return {
        dispose() {
          def.disposed += 1
          mountOptions.container.textContent = ""
        },
      }
    },
    mountWidget(mountOptions: {
      container: HTMLElement
      bridge: import("@platform-internal/core").HostBridge
      widgetId: string
      props: Record<string, unknown>
    }): WidgetHandle {
      def.mounts += 1
      def.lastBridge = mountOptions.bridge
      def.lastProps = mountOptions.props
      if (options.throwOnMount) throw new Error("widget exploded")
      mountOptions.container.textContent = `widget ${mountOptions.widgetId} ${JSON.stringify(mountOptions.props)}`
      return {
        dispose() {
          def.disposed += 1
        },
        setProps(props) {
          def.lastProps = props
          mountOptions.container.textContent = `widget ${mountOptions.widgetId} ${JSON.stringify(props)}`
        },
      }
    },
  }
  return def
}

export function fakeLoader(
  definitions: Record<
    string,
    RemoteDefinition | (() => RemoteDefinition | Promise<RemoteDefinition>)
  >
): RemoteLoader & { registered: string[]; loads: number; invalidated: string[] } {
  const loader = {
    name: "fake",
    registered: [] as string[],
    loads: 0,
    invalidated: [] as string[],
    async register(manifest: MfeManifest, options: { manifestUrl: string }) {
      loader.registered.push(`${manifest.mfeId}@${options.manifestUrl}`)
    },
    async load(manifest: MfeManifest) {
      loader.loads += 1
      const entry = definitions[manifest.mfeId]
      if (!entry) throw new Error(`no definition for ${manifest.mfeId}`)
      return typeof entry === "function" ? entry() : entry
    },
    sharedReport: (mfeId: string) =>
      definitions[mfeId]
        ? [
            {
              name: "react",
              version: "19.3.0",
              scope: "react19",
              outcome: "shared" as const,
              from: "shell",
              reason: "loaded-first",
            },
          ]
        : [],
    invalidate(mfeId: string) {
      loader.invalidated.push(mfeId)
    },
  }
  return loader
}

export function fakeFetch(
  responses: Record<string, unknown | (() => unknown)>,
  options: { failures?: Record<string, number>; status?: Record<string, number> } = {}
) {
  const calls: { url: string; init?: RequestInit }[] = []
  const remaining = { ...(options.failures ?? {}) }
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    const key = Object.keys(responses).find(
      (candidate) =>
        url === candidate || url.startsWith(`${candidate}?`) || url.startsWith(`${candidate}&`)
    )
    if (key && remaining[key] && remaining[key] > 0) {
      remaining[key] -= 1
      throw new TypeError("network down")
    }
    if (!key) return new Response("not found", { status: 404 })
    const status = options.status?.[key] ?? 200
    const body = responses[key]
    const value = typeof body === "function" ? (body as () => unknown)() : body
    return new Response(status === 200 ? JSON.stringify(value) : String(value ?? ""), {
      status,
      headers: { "content-type": "application/json" },
    })
  })
  return Object.assign(impl, { calls })
}

export function createTestHost(
  overrides: Partial<PlatformHostOptions> & {
    config?: RuntimeConfigInput
    registry?: RegistryEntry[]
  } = {}
) {
  const { config, ...rest } = overrides
  const storage = overrides.storage ?? createMemoryStorageBackend()
  const navigation = overrides.navigation ?? createMemoryNavigation("/")
  return createPlatformHost({
    runtimeConfig: parseRuntimeConfig(
      { environment: "test", retry: { attempts: 1, backoffMs: 0 }, ...(config ?? {}) },
      "test"
    ),
    registry: overrides.registry ?? [
      {
        mfeId: "asset-tracker",
        manifestUrl: `${ORIGIN}/mfes/asset-tracker/platform-manifest.json`,
        displayName: "Asset tracker",
      },
    ],
    navigation,
    storage,
    origin: ORIGIN,
    search: "",
    sleep: async () => {},
    autoPreload: false,
    context: { permissionGroups: ["admin"], user: { id: "u1", displayName: "Ada" } },
    ...rest,
  })
}
