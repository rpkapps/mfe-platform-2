import { existsSync, readFileSync } from "node:fs"
import { relative } from "node:path"

import { PlatformError, isPlatformError } from "@platform-internal/core"
import type { ModuleFederationOptions } from "@module-federation/vite"

import { stableHash } from "../hash"
import type { PlatformPluginOptions } from "../options"
import { buildFederationConfig, resolvePlatformConfig, type ResolvedPlatformConfig } from "../resolve-config"

/** Shared state between the plugins returned by `platform()`. */
export interface PlatformContext {
  root: string
  options: PlatformPluginOptions
  command: "build" | "serve"
  /** Resolved once per Vite run. */
  resolve(): Promise<ResolvedPlatformConfig>
  /** The resolved config; throws before `resolve()` settled. */
  config(): ResolvedPlatformConfig
  federation(): ModuleFederationOptions
  /** Hash of every restart-requiring input (config, shared, federation, dependencies, route tree). */
  configHash(): string
}

export function createPlatformContext(root: string, options: PlatformPluginOptions, command: "build" | "serve"): PlatformContext {
  let promise: Promise<ResolvedPlatformConfig> | undefined
  let resolved: ResolvedPlatformConfig | undefined
  let federation: ModuleFederationOptions | undefined
  const context: PlatformContext = {
    root,
    options,
    command,
    resolve() {
      promise ??= resolvePlatformConfig({ root, options, command }).then((config) => {
        resolved = config
        federation = buildFederationConfig(config)
        return config
      }, (error: unknown) => {
        throw toBuildError(error)
      })
      return promise
    },
    config() {
      if (!resolved) throw new Error("@platform/vite: the platform configuration is not resolved yet.")
      return resolved
    },
    federation() {
      if (!federation) throw new Error("@platform/vite: the federation configuration is not resolved yet.")
      return federation
    },
    configHash() {
      return computeConfigHash(context.config(), context.federation())
    },
  }
  return context
}

/** Vite prints `error.message`; give it the full actionable `PlatformError.format()` text. */
export function toBuildError(error: unknown): Error {
  if (isPlatformError(error)) {
    const wrapped = new Error(error.format(), { cause: error })
    wrapped.name = "PlatformError"
    Object.assign(wrapped, { code: error.code, platformError: error })
    return wrapped
  }
  return error instanceof Error ? error : new Error(String(error))
}

/** The manifest-affecting view of the resolved configuration, without timestamps or absolute paths. */
export function configFingerprint(config: ResolvedPlatformConfig, federation: ModuleFederationOptions): Record<string, unknown> {
  const rel = (file: string) => relative(config.root, file).replace(/\\/g, "/")
  return {
    mfeId: config.mfeId,
    routePrefix: config.routePrefix,
    displayName: config.displayName,
    description: config.description,
    discoverable: config.discoverable,
    navigation: config.navigation,
    permissionGroups: config.permissionGroups,
    capabilities: config.capabilities,
    sharedOverrides: config.sharedOverrides,
    shared: config.shared.requests,
    env: config.env,
    css: config.css,
    tecton: config.tecton,
    tectonVersion: config.tectonVersion,
    tailwind: config.tailwind,
    runtime: config.runtime,
    routesDirectory: rel(config.routesDirectory),
    entry: rel(config.entry),
    manifestFileName: config.manifestFileName,
    federation: { ...federation, exposes: Object.fromEntries(Object.entries(federation.exposes ?? {}).map(([key, value]) => [key, typeof value === "string" ? rel(value) : rel(value.import)])) },
    packageJson: { version: config.packageJson.version, dependencies: config.packageJson.dependencies, devDependencies: config.packageJson.devDependencies },
    routeTree: existsSync(config.routeTreeFile) ? readFileSync(config.routeTreeFile, "utf8") : null,
  }
}

export function computeConfigHash(config: ResolvedPlatformConfig, federation: ModuleFederationOptions): string {
  return stableHash(configFingerprint(config, federation))
}

export function restartError(config: ResolvedPlatformConfig, file: string, reason: string): PlatformError {
  return new PlatformError({
    code: "DEV_RESTART_REQUIRED",
    message: `${reason}; restart the development server to apply it.`,
    owner: { mfeId: config.mfeId },
    source: relative(config.root, file).replace(/\\/g, "/") || file,
    override: "restart `platform dev`",
  })
}
