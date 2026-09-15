import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, resolve } from "node:path"

import { validateManifest, type MfeManifest } from "@platform-internal/core"

import { CliError } from "../errors"
import { loadProjectModule, requireProjectRoot, resolveProjectModule } from "../project"
import { manifestFileName, summarizeManifest } from "./build"

export interface ManifestOptions {
  cwd?: string
  out?: string
  json?: boolean
  mode?: "build" | "dev"
  log?: (message: string) => void
}

export interface ManifestResult {
  manifest: MfeManifest
  /** Where the manifest came from: the Vite plugin generator or a file on disk. */
  source: string
  outFile?: string
}

interface PlatformViteModule {
  generateManifest?: (options: {
    root: string
    mode: "build" | "dev"
  }) => Promise<unknown> | unknown
}

/** Generate the manifest through `@platform/vite`, falling back to the last generated file. */
export async function readManifest(
  root: string,
  mode: "build" | "dev" = "build"
): Promise<{ manifest: unknown; source: string }> {
  if (resolveProjectModule(root, "@platform/vite")) {
    const mod = await loadProjectModule<PlatformViteModule>(
      root,
      "@platform/vite",
      "generate the manifest"
    )
    if (typeof mod.generateManifest === "function") {
      return {
        manifest: await mod.generateManifest({ root, mode }),
        source: "@platform/vite generateManifest",
      }
    }
  }
  const candidates = [
    join(root, ".platform", "manifest.json"),
    join(root, "dist", manifestFileName(root)),
  ]
  for (const file of candidates) {
    if (existsSync(file))
      return { manifest: JSON.parse(readFileSync(file, "utf8")), source: file }
  }
  throw new CliError({
    code: "DEPENDENCY_MISSING",
    message: `Cannot generate the manifest: "@platform/vite" is not installed in ${root} and no generated manifest exists (${candidates.join(", ")}).`,
    source: join(root, "package.json"),
    override: "pnpm add -D @platform/vite, or run `platform build` first",
  })
}

export async function manifest(options: ManifestOptions = {}): Promise<ManifestResult> {
  const root = requireProjectRoot(options.cwd ?? process.cwd())
  const log = options.log ?? ((message: string) => console.log(message))
  const { manifest: raw, source } = await readManifest(root, options.mode ?? "build")
  const validation = validateManifest(raw)
  if (!validation.ok) {
    throw new CliError({
      code: "VALIDATION_FAILED",
      message: `Manifest from ${source} is invalid:\n${validation.issues.map((issue) => `  - ${issue.path || "<root>"}: ${issue.message}`).join("\n")}`,
      source,
      override: "mfe.config.ts",
    })
  }
  const text = `${JSON.stringify(validation.manifest, null, 2)}\n`
  let outFile: string | undefined
  if (options.out) {
    outFile = isAbsolute(options.out) ? options.out : resolve(root, options.out)
    mkdirSync(dirname(outFile), { recursive: true })
    writeFileSync(outFile, text)
    log(`Wrote manifest (${source}) to ${outFile}`)
  }
  if (options.json) log(text.trimEnd())
  else if (!outFile) log(`${summarizeManifest(validation.manifest)}\n\n${text.trimEnd()}`)
  return { manifest: validation.manifest, source, outFile }
}
