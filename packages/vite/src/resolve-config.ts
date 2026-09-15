import { existsSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"

import {
  assertRoutePrefix,
  federationName,
  inferRoutePrefix,
  inferSharedDependencies,
  parseVersion,
  rangeMajor,
  type CapabilityId,
  type SharedRequest,
} from "@platform-internal/core"
import type { ModuleFederationOptions } from "@module-federation/vite"

import { resolveIdentity, type MfeIdSource } from "./identity"
import { loadMfeConfig } from "./load-config"
import type {
  EnvKeyOptions,
  MfeConfig,
  NavigationOptions,
  PlatformPluginOptions,
  ReactPluginOptions,
  SharedOptions,
} from "./options"
import {
  installedVersions,
  isPackageResolvable,
  readPackageJson,
  type PackageJson,
} from "./project"

export const DEFAULT_ROUTES_DIRECTORY = "src/routes"
export const DEFAULT_ENTRY = "src/mfe.tsx"
export const DEFAULT_ROUTE_TREE = "src/routeTree.gen.ts"
export const DEFAULT_MANIFEST_FILE_NAME = "platform-manifest.json"
export const GENERATED_ENTRY = ".platform/entry.tsx"
export const REMOTE_ENTRY_FILE = "remoteEntry.js"
export const MF_MANIFEST_FILE = "mf-manifest.json"
export const EXPOSE_KEY = "./mfe"
export const TECTON_PACKAGE = "@tecton/react"
export const TECTON_CSS_PROTOCOL = "1"

export interface RuntimeRequirement {
  requiredVersion: string
  major: number
  builtWith?: string
}

export interface ResolvedRuntime {
  react: RuntimeRequirement
  reactDom?: RuntimeRequirement
  tanstackRouter?: { requiredVersion: string; builtWith?: string }
  platformReact?: { requiredVersion: string; builtWith?: string }
}

/** Fully resolved plugin configuration: plugin option → mfe.config → inference → default, per key. */
export interface ResolvedPlatformConfig {
  root: string
  mfeId: string
  mfeIdSource: MfeIdSource
  federationName: string
  routePrefix: string
  displayName: string
  description?: string
  discoverable: boolean
  navigation?: NavigationOptions
  permissionGroups: string[]
  capabilities: { add: CapabilityId[]; remove: CapabilityId[] }
  sharedOverrides: SharedOptions
  shared: { requests: SharedRequest[]; reactMajor: number; warnings: string[] }
  env: Record<string, EnvKeyOptions>
  css: { scope: boolean; ownerAttribute: string; foundation: "shell" | "bundled" }
  tecton: boolean
  tectonVersion?: string
  tailwind: boolean
  react: false | ReactPluginOptions
  /** Absolute paths. */
  routesDirectory: string
  routeTreeFile: string
  entry: string
  generatedEntry: string
  platformDir: string
  manifestFileName: string
  federation?: (config: ModuleFederationOptions) => ModuleFederationOptions
  runtime: ResolvedRuntime
  harness: { enabled: boolean; dir?: string }
  packageJson: PackageJson
  installed: Record<string, string>
  /** `mfe.config.*` path when present. */
  configFile?: string
  /** Files the resolution depends on (config file and its imports, package.json). */
  dependencies: string[]
  warnings: string[]
}

export interface ResolvePlatformConfigOptions {
  root: string
  options?: PlatformPluginOptions
  command?: "build" | "serve"
  mode?: string
  /** Do not write `.platform/identity.json` (read-only tooling). */
  persistIdentity?: boolean
}

const RUNTIME_PACKAGES = [
  "react",
  "react-dom",
  "@tanstack/react-router",
  "@platform/react",
  TECTON_PACKAGE,
]

function pick<T>(...values: (T | undefined)[]): T | undefined {
  for (const value of values) if (value !== undefined) return value
  return undefined
}

function toAbsolute(root: string, file: string): string {
  return isAbsolute(file) ? file : resolve(root, file)
}

function rangeFor(
  name: string,
  packageJson: PackageJson,
  installed: Record<string, string>
): string | undefined {
  const declared =
    packageJson.dependencies?.[name] ??
    packageJson.peerDependencies?.[name] ??
    packageJson.devDependencies?.[name]
  if (declared && !/^(workspace:|catalog:|github:|git\+|file:|link:|npm:)/.test(declared))
    return declared
  const version = installed[name]
  return version ? `^${version}` : undefined
}

function majorFor(
  range: string | undefined,
  installed: string | undefined,
  fallback: number
): number {
  return (range ? rangeMajor(range) : null) ?? parseVersion(installed ?? "")?.major ?? fallback
}

/**
 * Resolve everything the plugin, the manifest generator and the CLI need from
 * the plugin options, `mfe.config.*`, `package.json`, the installed packages
 * and the persisted identity. Throws `PlatformError`s for invalid ids and
 * prefixes; inference never throws.
 */
export async function resolvePlatformConfig(
  input: ResolvePlatformConfigOptions
): Promise<ResolvedPlatformConfig> {
  const root = resolve(input.root)
  const options = input.options ?? {}
  const loaded = await loadMfeConfig(root, {
    command: input.command ?? "build",
    mode: input.mode ?? (input.command === "serve" ? "development" : "production"),
  })
  const config: MfeConfig = loaded.config
  const packageJson = readPackageJson(root)
  const warnings: string[] = []

  const identity = resolveIdentity({
    root,
    optionMfeId: options.mfeId,
    configMfeId: config.mfeId,
    packageName: packageJson.name,
    persist: input.persistIdentity ?? true,
  })
  const mfeId = identity.mfeId
  const routePrefix = assertRoutePrefix(
    pick(options.routePrefix, config.routePrefix) ?? inferRoutePrefix(mfeId),
    mfeId
  )

  const dependencies = { ...(packageJson.dependencies ?? {}) }
  const devDependencies = packageJson.devDependencies ?? {}
  const sharedOverrides: SharedOptions = { ...(config.shared ?? {}), ...(options.shared ?? {}) }
  const installed = installedVersions(
    root,
    new Set([
      ...Object.keys(dependencies),
      ...Object.keys(devDependencies),
      ...Object.keys(sharedOverrides),
      ...RUNTIME_PACKAGES,
    ])
  )
  const shared = inferSharedDependencies({
    dependencies,
    installed,
    overrides: sharedOverrides,
  })
  warnings.push(...shared.warnings)

  const tectonDeclared = TECTON_PACKAGE in dependencies || TECTON_PACKAGE in devDependencies
  const tectonOption = pick(options.tecton, config.tecton) ?? "auto"
  const tecton = tectonOption === "auto" ? tectonDeclared : tectonOption
  if (tecton && !tectonDeclared && !installed[TECTON_PACKAGE])
    warnings.push(
      `tecton is enabled but "${TECTON_PACKAGE}" is not a dependency of the project.`
    )

  const tailwindOption = options.tailwind ?? "auto"
  const tailwind =
    tailwindOption === "auto" ? isPackageResolvable(root, "tailwindcss") : tailwindOption

  const navigation = pick(options.navigation, config.navigation)
  const displayName =
    pick(options.displayName, config.displayName) ?? navigation?.title ?? mfeId
  const cssOptions = { ...(config.css ?? {}), ...(options.css ?? {}) }
  const runtimeOverrides = { ...(config.runtime ?? {}), ...(options.runtime ?? {}) }
  const harnessOptions = { ...(config.harness ?? {}), ...(options.harness ?? {}) }

  const reactRange = runtimeOverrides.react ?? rangeFor("react", packageJson, installed)
  const reactMajor = majorFor(reactRange, installed.react, shared.reactMajor)
  const runtime: ResolvedRuntime = {
    react: {
      requiredVersion: reactRange ?? `^${reactMajor}.0.0`,
      major: reactMajor,
      builtWith: installed.react,
    },
  }
  const reactDomRange =
    runtimeOverrides.reactDom ?? rangeFor("react-dom", packageJson, installed)
  if (reactDomRange)
    runtime.reactDom = {
      requiredVersion: reactDomRange,
      major: majorFor(reactDomRange, installed["react-dom"], reactMajor),
      builtWith: installed["react-dom"],
    }
  const routerRange =
    runtimeOverrides.tanstackRouter ??
    rangeFor("@tanstack/react-router", packageJson, installed)
  if (routerRange)
    runtime.tanstackRouter = {
      requiredVersion: routerRange,
      builtWith: installed["@tanstack/react-router"],
    }
  const platformReactRange =
    runtimeOverrides.platformReact ?? rangeFor("@platform/react", packageJson, installed)
  if (platformReactRange)
    runtime.platformReact = {
      requiredVersion: platformReactRange,
      builtWith: installed["@platform/react"],
    }
  if (!reactRange)
    warnings.push(
      `react is not a dependency of the project; runtime compatibility metadata defaults to React ${reactMajor}.`
    )

  const routesDirectory = toAbsolute(
    root,
    pick(options.routesDirectory, config.routesDirectory) ?? DEFAULT_ROUTES_DIRECTORY
  )
  const entry = toAbsolute(root, pick(options.entry, config.entry) ?? DEFAULT_ENTRY)
  const dependenciesOfConfig = [
    join(root, "package.json"),
    ...(loaded.file ? [loaded.file] : []),
    ...loaded.dependencies.map((file) => toAbsolute(root, file)),
  ]

  return {
    root,
    mfeId,
    mfeIdSource: identity.source,
    federationName: federationName(mfeId),
    routePrefix,
    displayName,
    description: pick(options.description, config.description, packageJson.description),
    discoverable: pick(options.discoverable, config.discoverable) ?? true,
    navigation,
    permissionGroups: [
      ...new Set([...(config.permissionGroups ?? []), ...(options.permissionGroups ?? [])]),
    ],
    capabilities: {
      add: [
        ...new Set([...(config.capabilities?.add ?? []), ...(options.capabilities?.add ?? [])]),
      ],
      remove: [
        ...new Set([
          ...(config.capabilities?.remove ?? []),
          ...(options.capabilities?.remove ?? []),
        ]),
      ],
    },
    sharedOverrides,
    shared,
    env: { ...(config.env ?? {}), ...(options.env ?? {}) },
    css: {
      scope: cssOptions.scope ?? true,
      ownerAttribute: cssOptions.ownerAttribute ?? "data-mfe",
      foundation: cssOptions.foundation ?? "shell",
    },
    tecton,
    tectonVersion: installed[TECTON_PACKAGE],
    tailwind,
    react: options.react ?? {},
    routesDirectory,
    routeTreeFile: join(root, DEFAULT_ROUTE_TREE),
    entry,
    generatedEntry: join(root, GENERATED_ENTRY),
    platformDir: join(root, ".platform"),
    manifestFileName:
      pick(options.manifest?.fileName, config.manifest?.fileName) ?? DEFAULT_MANIFEST_FILE_NAME,
    federation: pick(options.federation, config.federation),
    runtime,
    harness: {
      enabled: harnessOptions.enabled ?? true,
      dir: harnessOptions.dir ? toAbsolute(root, harnessOptions.dir) : undefined,
    },
    packageJson,
    installed,
    configFile: loaded.file,
    dependencies: dependenciesOfConfig,
    warnings,
  }
}

/** Module Federation configuration derived from the resolved config (before the `federation` escape hatch). */
export function buildFederationConfig(config: ResolvedPlatformConfig): ModuleFederationOptions {
  const shared: NonNullable<Exclude<ModuleFederationOptions["shared"], string[]>> = {}
  for (const request of config.shared.requests) {
    if (!request.shared) continue
    shared[request.name] = {
      singleton: request.singleton,
      requiredVersion: request.requiredVersion,
      shareScope: request.scope,
      version: request.version,
    }
  }
  const base: ModuleFederationOptions = {
    name: config.federationName,
    filename: REMOTE_ENTRY_FILE,
    exposes: { [EXPOSE_KEY]: config.generatedEntry },
    shared,
    manifest: true,
    dts: false,
  }
  return config.federation ? config.federation(base) : base
}

export function entryExists(config: ResolvedPlatformConfig): boolean {
  return existsSync(config.entry)
}
