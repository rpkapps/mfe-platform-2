import { resolve } from "node:path"

import { federation } from "@module-federation/vite"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import type { Plugin, PluginOption } from "vite"

import { createPlatformContext } from "./plugin/context"
import { platformCorePlugin } from "./plugin/core"
import { platformCssPlugin } from "./plugin/css"
import { platformDevPlugin } from "./plugin/dev"
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
export { scopeCss, rewriteAnimationNames, type ScopeCssOptions, type ScopeCssResult } from "./css-scope"
export { generateManifest, buildManifestInput, detectCommit, writeManifestCopy, serializeManifest, type GenerateManifestOptions, type GeneratedManifest } from "./manifest"
export { resolvePlatformConfig, buildFederationConfig, type ResolvedPlatformConfig, type ResolvePlatformConfigOptions, type ResolvedRuntime, type RuntimeRequirement } from "./resolve-config"
export { routePathFromFile, analyzeRouteSource, deriveRoutes, listRouteFiles, joinRoutePath, type RouteFileAnalysis, type DerivedRoutes, type RouteFileEntry } from "./routes"
export { analyzeSourceFile, analyzeProjectSources, mergeAnalyses, finalizeCapabilities, listSourceFiles, type FileAnalysis, type ProjectAnalysis } from "./analysis"
export { resolveIdentity, readIdentity, writeIdentity, type PersistedIdentity, type ResolvedIdentity, type MfeIdSource } from "./identity"
export { loadMfeConfig, findMfeConfigFile, type LoadedMfeConfig } from "./load-config"
export { renderEntry, writeGeneratedEntry, GENERATED_BANNER } from "./entry"
export { computeConfigHash, configFingerprint } from "./plugin/context"
export { renderRefreshPreamble, injectHarnessConfig, renderFallbackHarness, resolveHarnessDir, DEV_MANIFEST_PATH, REFRESH_PREAMBLE_PATH, HARNESS_PATH, RESTART_EVENT } from "./plugin/dev"

/**
 * Turn an ordinary TanStack Router project into a platform remote.
 *
 * ```ts
 * // vite.config.ts
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
 *
 * The React plugin is added synchronously; everything that depends on
 * `mfe.config.ts` (loaded asynchronously) is returned as a promise entry,
 * which Vite resolves while flattening `plugins`. Use it as `plugins:
 * [platform()]`. The project root is `process.cwd()` (Vite's default) unless
 * `root` is passed.
 */
export function platform(options: PlatformPluginOptions = {}): PluginOption[] {
  const root = resolve(options.root ?? process.cwd())
  const command: "build" | "serve" = process.argv.includes("build") ? "build" : "serve"
  const context = createPlatformContext(root, options, command)
  const plugins: PluginOption[] = []
  if (options.react !== false) plugins.push(react(options.react ?? {}))
  plugins.push(
    context.resolve().then((config): PluginOption[] => {
      const composed: PluginOption[] = []
      if (config.tailwind) composed.push(tailwindcss())
      composed.push(
        tanstackRouter({
          target: "react",
          autoCodeSplitting: true,
          routesDirectory: config.routesDirectory,
          generatedRouteTree: resolve(config.root, DEFAULT_ROUTE_TREE),
        })
      )
      composed.push(platformCssPlugin(context), platformCorePlugin(context), platformDevPlugin(context))
      composed.push(...(federation(context.federation()) as Plugin[]))
      return composed
    })
  )
  return plugins
}

export default platform
