import { existsSync, readFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"

import { validateManifest, type MfeManifest } from "@platform-internal/core"

import { CliError } from "../errors"
import { readStaticMfeConfig } from "../mfe-config"
import { loadProjectModule, requireProjectRoot } from "../project"
import { findViteConfig } from "../vite-config"

export interface BuildOptions {
  cwd?: string
  outDir?: string
  log?: (message: string) => void
}

export interface BuildResult {
  outDir: string
  manifestFile: string
  manifest: MfeManifest
  summary: string
}

interface ViteModule {
  build(config: Record<string, unknown>): Promise<unknown>
}

export function manifestFileName(root: string): string {
  const config = readStaticMfeConfig(root)
  const manifest = config?.config.manifest as { fileName?: unknown } | undefined
  return typeof manifest?.fileName === "string" ? manifest.fileName : "platform-manifest.json"
}

export function summarizeManifest(manifest: MfeManifest): string {
  const shared = manifest.shared.filter((entry) => entry.shared)
  const bundled = manifest.shared.filter((entry) => !entry.shared)
  const lines = [
    `mfeId:        ${manifest.mfeId}${manifest.displayName ? ` (${manifest.displayName})` : ""}`,
    `version:      ${manifest.version}${manifest.release.buildId ? `  build ${manifest.release.buildId}` : ""}`,
    `protocol:     ${manifest.protocolVersion}  (manifest schema ${manifest.schemaVersion})`,
    `entry:        ${manifest.entry.file} → ${manifest.entry.expose} (${manifest.entry.name})`,
    `route prefix: ${manifest.routePrefix ?? `/${manifest.mfeId}`}`,
    `routes:       ${manifest.routes.length}${manifest.routes.length ? `  ${manifest.routes.map((route) => route.fullPath).join(", ")}` : ""}`,
    `widgets:      ${manifest.widgets.length}${manifest.widgets.length ? `  ${manifest.widgets.map((widget) => widget.id).join(", ")}` : ""}`,
    `capabilities: ${manifest.capabilities.join(", ") || "none"}`,
    `shared:       ${shared.length} shared, ${bundled.length} bundled${shared.length ? `  (${shared.map((entry) => `${entry.name}@${entry.requiredVersion} [${entry.scope}]`).join(", ")})` : ""}`,
    `runtime:      react ${manifest.runtime.react.requiredVersion} (major ${manifest.runtime.react.major})`,
    `tecton:       ${manifest.tecton.enabled ? `enabled (${manifest.tecton.foundation} foundation)` : "disabled"}`,
    `css:          ${manifest.css.scoped ? `scoped under [${manifest.css.ownerAttribute}]` : "unscoped"}, ${manifest.css.assets.length} asset${manifest.css.assets.length === 1 ? "" : "s"}`,
    `env keys:     ${Object.keys(manifest.env.keys).join(", ") || "none"}`,
    `registrations: ${manifest.commands.length} commands, ${manifest.settings.length} settings groups, ${manifest.help.length} help, ${manifest.releaseNotes.length} release notes`,
  ]
  return lines.join("\n")
}

/** `platform build`: `vite build` with the project's config, then manifest validation and a summary. */
export async function build(options: BuildOptions = {}): Promise<BuildResult> {
  const root = requireProjectRoot(options.cwd ?? process.cwd())
  const log = options.log ?? ((message: string) => console.log(message))
  const vite = await loadProjectModule<ViteModule>(root, "vite", "build the remote")
  const outDir = options.outDir
    ? isAbsolute(options.outDir)
      ? options.outDir
      : resolve(root, options.outDir)
    : join(root, "dist")
  try {
    await vite.build({
      root,
      configFile: findViteConfig(root) ?? false,
      mode: "production",
      ...(options.outDir ? { build: { outDir } } : {}),
    })
  } catch (error) {
    throw new CliError({
      code: "BUILD_FAILED",
      message: `Vite build failed: ${error instanceof Error ? error.message : String(error)}`,
      source: root,
      cause: error,
    })
  }
  const manifestFile = join(outDir, manifestFileName(root))
  if (!existsSync(manifestFile)) {
    throw new CliError({
      code: "BUILD_FAILED",
      message: `The build produced no manifest at ${manifestFile}. Is \`platform()\` from @platform/vite in vite.config.ts?`,
      source: findViteConfig(root) ?? root,
      override: "mfe.config.ts → manifest.fileName",
    })
  }
  const parsed: unknown = JSON.parse(readFileSync(manifestFile, "utf8"))
  const validation = validateManifest(parsed)
  if (!validation.ok) {
    throw new CliError({
      code: "BUILD_FAILED",
      message: `Generated manifest is invalid:\n${validation.issues.map((issue) => `  - ${issue.path || "<root>"}: ${issue.message}`).join("\n")}`,
      source: manifestFile,
      override: "mfe.config.ts",
    })
  }
  const summary = summarizeManifest(validation.manifest)
  log(`\nBuilt ${validation.manifest.mfeId} → ${outDir}\n${summary}`)
  return { outDir, manifestFile, manifest: validation.manifest, summary }
}
