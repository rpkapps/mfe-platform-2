import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { IMPLICIT_CAPABILITIES, PlatformError, validateManifest, type DevInfo, type MfeManifest, type MfeManifestInput } from "@platform-internal/core"

import { analyzeProjectSources, finalizeCapabilities, type ProjectAnalysis } from "./analysis"
import { hashString } from "./hash"
import { ensurePlatformDir } from "./identity"
import type { PlatformPluginOptions } from "./options"
import { EXPOSE_KEY, MF_MANIFEST_FILE, REMOTE_ENTRY_FILE, TECTON_CSS_PROTOCOL, resolvePlatformConfig, type ResolvedPlatformConfig } from "./resolve-config"
import { deriveRoutes, type DerivedRoutes } from "./routes"

export interface GenerateManifestOptions {
  root: string
  options?: PlatformPluginOptions
  /** `build` produces a production manifest (no `dev` block); `dev` adds the `dev` block from `dev`. */
  mode?: "build" | "dev"
  /** Already resolved configuration (skips resolving again). */
  config?: ResolvedPlatformConfig
  /** Dev-server information merged into `manifest.dev` (mode `dev`). */
  dev?: Partial<DevInfo> & { origin?: string }
  /** CSS assets emitted by the build (relative to the remote base URL). */
  cssAssets?: string[]
  /** Fixed timestamp / build id (tests). */
  builtAt?: string
  buildId?: string
  /** Do not persist identity (read-only tooling). */
  persistIdentity?: boolean
}

export interface GeneratedManifest {
  manifest: MfeManifest
  input: MfeManifestInput
  config: ResolvedPlatformConfig
  routes: DerivedRoutes
  analysis: ProjectAnalysis
  warnings: string[]
}

export function detectCommit(root: string): string | undefined {
  const fromEnv = process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA ?? process.env.PLATFORM_COMMIT_SHA
  if (fromEnv) return fromEnv
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 5000 }).trim() || undefined
  } catch {
    return undefined
  }
}

/** Build the manifest input from the resolved configuration and static analysis, without running Vite. */
export function buildManifestInput(config: ResolvedPlatformConfig, options: Omit<GenerateManifestOptions, "root" | "options" | "config"> = {}): { input: MfeManifestInput; routes: DerivedRoutes; analysis: ProjectAnalysis; warnings: string[] } {
  const mode = options.mode ?? "build"
  const routes = deriveRoutes({ root: config.root, routesDirectory: config.routesDirectory, routePrefix: config.routePrefix })
  const analysis = analyzeProjectSources({ root: config.root })
  const warnings = [...config.warnings, ...routes.warnings, ...analysis.warnings]
  const kind: MfeManifestInput["kind"] = !routes.hasRoutes && analysis.widgets.length > 0 ? "widget-library" : "mfe"
  const version = config.packageJson.version ?? "0.0.0"
  const builtAt = options.builtAt ?? new Date().toISOString()
  const buildId = options.buildId ?? process.env.PLATFORM_BUILD_ID ?? hashString(`${config.mfeId}@${version}@${builtAt}`)
  const permissionGroups = [...new Set([...config.permissionGroups, ...routes.routes.flatMap((route) => route.permissionGroups ?? [])])]
  const capabilities = finalizeCapabilities(analysis.capabilities, IMPLICIT_CAPABILITIES, config.capabilities.add, config.capabilities.remove)
  const envKeys: NonNullable<MfeManifestInput["env"]>["keys"] = {}
  for (const [key, declaration] of Object.entries(config.env)) {
    envKeys[key] = { required: declaration.required ?? false, description: declaration.description, default: declaration.default, public: true }
  }

  const input: MfeManifestInput = {
    mfeId: config.mfeId,
    kind,
    version,
    displayName: config.displayName,
    description: config.description,
    release: { version, buildId, commit: detectCommit(config.root), builtAt },
    entry: { loader: "module-federation", name: config.federationName, file: REMOTE_ENTRY_FILE, expose: EXPOSE_KEY, type: "module", loaderManifest: MF_MANIFEST_FILE },
    remote: { baseUrl: mode === "dev" && options.dev?.origin ? `${options.dev.origin.replace(/\/$/, "")}/` : "./", preload: "none" },
    routes: routes.routes,
    navigation: config.navigation,
    discoverable: config.discoverable,
    permissionGroups,
    capabilities,
    commands: analysis.commands,
    settings: analysis.settings,
    help: analysis.help,
    releaseNotes: analysis.releaseNotes,
    widgets: analysis.widgets,
    shared: config.shared.requests,
    runtime: config.runtime,
    tecton: { enabled: config.tecton, version: config.tectonVersion, cssProtocol: config.tecton ? TECTON_CSS_PROTOCOL : undefined, foundation: config.css.foundation },
    css: { ownerAttribute: config.css.ownerAttribute, scoped: config.css.scope, assets: options.cssAssets ?? [] },
    env: { keys: envKeys },
  }
  if (kind === "mfe") input.routePrefix = config.routePrefix
  if (mode === "dev") {
    const { origin, ...rest } = options.dev ?? {}
    input.dev = { hmr: true, origin, refreshPreamble: "/@platform/refresh-preamble", ...rest }
  }
  return { input, routes, analysis, warnings }
}

export function validateManifestInput(input: MfeManifestInput, config: ResolvedPlatformConfig): MfeManifest {
  const result = validateManifest(input)
  if (result.ok) return result.manifest
  const issues = result.issues.map((issue) => `  - ${issue.path || "(root)"}: ${issue.message}`).join("\n")
  throw new PlatformError({
    code: "MANIFEST_INVALID",
    message: `The generated manifest for "${config.mfeId}" is invalid:\n${issues}`,
    owner: { mfeId: config.mfeId },
    source: config.configFile ?? "mfe.config.ts",
    override: "mfe.config.ts",
    details: { issues: result.issues },
  })
}

/**
 * Generate (and validate) the platform manifest from static inference alone.
 * Used by the plugin at build time, by the dev server for `/platform-manifest.json`
 * and by the CLI (`platform manifest`, `platform validate`).
 */
export async function generateManifest(options: GenerateManifestOptions): Promise<GeneratedManifest> {
  const config = options.config ?? (await resolvePlatformConfig({ root: options.root, options: options.options, command: options.mode === "dev" ? "serve" : "build", persistIdentity: options.persistIdentity }))
  const { input, routes, analysis, warnings } = buildManifestInput(config, options)
  const manifest = validateManifestInput(input, config)
  return { manifest, input, config, routes, analysis, warnings }
}

/** Persist a copy under `.platform/manifest.json` for `platform manifest` / `platform validate`. */
export function writeManifestCopy(config: ResolvedPlatformConfig, manifest: MfeManifest): string {
  const dir = ensurePlatformDir(config.root)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, "manifest.json")
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
  return file
}

export function serializeManifest(manifest: MfeManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}
