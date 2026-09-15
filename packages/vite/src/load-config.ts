import { existsSync } from "node:fs"
import { join } from "node:path"

import { PlatformError } from "@platform-internal/core"
import { loadConfigFromFile } from "vite"

import type { MfeConfig } from "./options"

export const MFE_CONFIG_FILES = [
  "mfe.config.ts",
  "mfe.config.mts",
  "mfe.config.js",
  "mfe.config.mjs",
] as const

export function findMfeConfigFile(root: string): string | undefined {
  for (const name of MFE_CONFIG_FILES) {
    const file = join(root, name)
    if (existsSync(file)) return file
  }
  return undefined
}

export interface LoadedMfeConfig {
  file: string | undefined
  config: MfeConfig
  /** Files the config depends on (imports), for watching. */
  dependencies: string[]
}

/**
 * Load `mfe.config.{ts,mts,js,mjs}` from the project root with Vite's config
 * loader (TypeScript, ESM, relative imports all work). A missing file yields an
 * empty config; a broken file fails with a `PlatformError`.
 */
export async function loadMfeConfig(
  root: string,
  env: { command: "build" | "serve"; mode: string } = { command: "build", mode: "production" }
): Promise<LoadedMfeConfig> {
  const file = findMfeConfigFile(root)
  if (!file) return { file: undefined, config: {}, dependencies: [] }
  let loaded: Awaited<ReturnType<typeof loadConfigFromFile>>
  try {
    loaded = await loadConfigFromFile(
      { command: env.command, mode: env.mode },
      file,
      root,
      "silent"
    )
  } catch (error) {
    throw new PlatformError({
      code: "INTERNAL",
      message: `Failed to load ${file}: ${error instanceof Error ? error.message : String(error)}`,
      source: file,
      cause: error,
    })
  }
  const config = (loaded?.config ?? {}) as unknown
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new PlatformError({
      code: "INTERNAL",
      message: `${file} must default-export an object (use defineMfeConfig from "@platform/vite/config").`,
      source: file,
    })
  }
  return { file, config: config as MfeConfig, dependencies: loaded?.dependencies ?? [] }
}
