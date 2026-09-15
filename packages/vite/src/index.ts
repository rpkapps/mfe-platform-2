import { existsSync } from "node:fs"
import { resolve } from "node:path"

import { federation } from "@module-federation/vite"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import type { Plugin, PluginOption } from "vite"

import { createPlatformContext } from "./plugin/context"
import { platformCorePlugin } from "./plugin/core"
import { platformCssPlugin } from "./plugin/css"
import {
  platformDefinePlugin,
  DEDUPED_PACKAGES,
  MFE_ID_DEFINE,
  ROUTE_PREFIX_DEFINE,
} from "./plugin/define"
import { platformDevPlugin } from "./plugin/dev"
import { platformRouterHmrPlugin } from "./plugin/router-hmr"
import type { PlatformPluginOptions } from "./options"
import { DEFAULT_ROUTE_TREE } from "./resolve-config"

export type {
  PlatformPluginOptions,
  MfeConfig,
  NavigationOptions,
  CapabilityOptions,
  EnvKeyOptions,
  CssOptions,
  ManifestOptions,
  RuntimeOverrides,
  HarnessOptions,
  SharedOptions,
  ReactPluginOptions,
  ModuleFederationOptions,
} from "./options"
export { defineMfeConfig } from "./config"
export {
  scopeCss,
  rewriteAnimationNames,
  type ScopeCssOptions,
  type ScopeCssResult,
} from "./css-scope"
export {
  generateManifest,
  buildManifestInput,
  detectCommit,
  writeManifestCopy,
  serializeManifest,
  type GenerateManifestOptions,
  type GeneratedManifest,
} from "./manifest"
export {
  resolvePlatformConfig,
  buildFederationConfig,
  type ResolvedPlatformConfig,
  type ResolvePlatformConfigOptions,
  type ResolvedRuntime,
  type RuntimeRequirement,
} from "./resolve-config"
export {
  routePathFromFile,
  analyzeRouteSource,
  deriveRoutes,
  listRouteFiles,
  joinRoutePath,
  type RouteFileAnalysis,
  type DerivedRoutes,
  type RouteFileEntry,
} from "./routes"
export {
  analyzeSourceFile,
  analyzeProjectSources,
  mergeAnalyses,
  finalizeCapabilities,
  listSourceFiles,
  type FileAnalysis,
  type ProjectAnalysis,
} from "./analysis"
export {
  resolveIdentity,
  readIdentity,
  writeIdentity,
  type PersistedIdentity,
  type ResolvedIdentity,
  type MfeIdSource,
} from "./identity"
export { loadMfeConfig, findMfeConfigFile, type LoadedMfeConfig } from "./load-config"
export { renderEntry, writeGeneratedEntry, GENERATED_BANNER } from "./entry"
export { computeConfigHash, configFingerprint } from "./plugin/context"
export { MFE_ID_DEFINE, ROUTE_PREFIX_DEFINE }
export { rewriteRouterHmrGlue, ROUTER_REGISTRY_KEY } from "./plugin/router-hmr"
export {
  renderRefreshPreamble,
  injectHarnessConfig,
  renderFallbackHarness,
  resolveHarnessDir,
  DEV_MANIFEST_PATH,
  REFRESH_PREAMBLE_PATH,
  HARNESS_PATH,
  RESTART_EVENT,
} from "./plugin/dev"

/** True when `platform()` runs under Vitest (`vitest.config.ts` shares the same plugin call). */
export function isTestEnvironment(): boolean {
  return process.env.VITEST !== undefined
}

/** Keep third-party plugins out of `vite --mode test` runs; their own `apply` is respected. */
function outsideTestMode(plugins: Plugin[]): Plugin[] {
  return plugins.map((plugin) => {
    const original = plugin.apply
    const apply: Plugin["apply"] = (config, env) => {
      if (env.mode === "test") return false
      if (typeof original === "function") return original(config, env)
      if (typeof original === "string") return original === env.command
      return true
    }
    return { ...plugin, apply }
  })
}

/**
 * Turn an ordinary TanStack Router project into a platform remote.
 *
 * ```ts
 * // vite.config.ts and vitest.config.ts
 * import { defineConfig } from "vite"
 * import { platform } from "@platform/vite"
 * export default defineConfig({ plugins: [platform()] })
 * ```
 *
 * Composes `@vitejs/plugin-react`, `@tailwindcss/vite` (when Tailwind is
 * installed), the TanStack Router plugin (file routes, generated route tree,
 * automatic code splitting), CSS selector scoping, the generated
 * `.platform/entry.tsx`, manifest generation with capability, route and
 * shared-dependency inference, the dev endpoints and `@module-federation/vite`.
 * Under Vitest (`process.env.VITEST`, or `test: true`) only the React plugin
 * and the `__PLATFORM_MFE_ID__` / `__PLATFORM_ROUTE_PREFIX__` defines are
 * returned; `vite --mode test` gets the same reduced set.
 *
 * `mfe.config.ts` is loaded asynchronously, so the plugins are returned as a
 * promise entry that Vite resolves while flattening `plugins`. Use it as
 * `plugins: [platform()]`. The project root is `process.cwd()` (Vite's
 * default) unless `root` is passed.
 */
export function platform(options: PlatformPluginOptions = {}): PluginOption[] {
  const test = options.test ?? isTestEnvironment()
  const command: "build" | "serve" = process.argv.includes("build") ? "build" : "serve"
  const reactPlugins = (): PluginOption[] =>
    options.react === false ? [] : [react(options.react ?? {})]
  if (test) {
    // Under Vitest the project root comes from the project config (a workspace run
    // starts every project from the repository root, so `process.cwd()` would be wrong).
    const lazy: Plugin = {
      name: "platform:test",
      async config(userConfig) {
        const root = resolve(options.root ?? userConfig.root ?? process.cwd())
        const context = createPlatformContext(root, options, command)
        const config = await context.resolve()
        return {
          resolve: {
            dedupe: DEDUPED_PACKAGES,
            tsconfigPaths: userConfig.resolve?.tsconfigPaths ?? true,
          },
          define: {
            [MFE_ID_DEFINE]: JSON.stringify(config.mfeId),
            [ROUTE_PREFIX_DEFINE]: JSON.stringify(config.routePrefix),
          },
        }
      },
    }
    return [...reactPlugins(), lazy]
  }
  const root = resolve(options.root ?? process.cwd())
  const context = createPlatformContext(root, options, command)
  return [
    context.resolve().then((config): PluginOption[] => {
      const composed: PluginOption[] = []
      if (config.tailwind) composed.push(outsideTestMode(tailwindcss()))
      // The router plugin must run before JSX transformation (it enforces this order).
      // Widget libraries have no routes directory and no route tree to generate.
      if (existsSync(resolve(config.root, config.routesDirectory))) {
        const router = tanstackRouter({
          target: "react",
          autoCodeSplitting: true,
          routesDirectory: config.routesDirectory,
          generatedRouteTree: resolve(config.root, DEFAULT_ROUTE_TREE),
        })
        composed.push(outsideTestMode(Array.isArray(router) ? router : [router]))
      }
      composed.push(...reactPlugins())
      composed.push(
        platformRouterHmrPlugin(context),
        platformDefinePlugin(context),
        platformCssPlugin(context),
        platformCorePlugin(context),
        platformDevPlugin(context)
      )
      composed.push(outsideTestMode(federation(context.federation()) as Plugin[]))
      return composed
    }),
  ]
}

export default platform
