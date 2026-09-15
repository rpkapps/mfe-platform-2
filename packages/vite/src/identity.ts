import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { assertMfeId, inferMfeId } from "@platform-internal/core"

export const PLATFORM_DIR = ".platform"
export const IDENTITY_FILE = "identity.json"

export interface PersistedIdentity {
  mfeId: string
  createdAt: string
}

export type MfeIdSource = "option" | "config" | "identity" | "inferred"

export interface ResolvedIdentity {
  mfeId: string
  source: MfeIdSource
  file: string
  /** True when the identity file was created or updated by this call. */
  written: boolean
}

export function platformDir(root: string): string {
  return join(root, PLATFORM_DIR)
}

export function readIdentity(root: string): PersistedIdentity | undefined {
  const file = join(platformDir(root), IDENTITY_FILE)
  if (!existsSync(file)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<PersistedIdentity>
    if (typeof parsed.mfeId !== "string") return undefined
    return {
      mfeId: parsed.mfeId,
      createdAt:
        typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
    }
  } catch {
    return undefined
  }
}

/** `.platform/.gitignore`: everything is generated except the identity, which is committed. */
export function ensurePlatformDir(root: string): string {
  const dir = platformDir(root)
  mkdirSync(dir, { recursive: true })
  const gitignore = join(dir, ".gitignore")
  const content = "*\n!identity.json\n!.gitignore\n"
  if (!existsSync(gitignore) || readFileSync(gitignore, "utf8") !== content)
    writeFileSync(gitignore, content)
  return dir
}

export function writeIdentity(root: string, identity: PersistedIdentity): string {
  const dir = ensurePlatformDir(root)
  const file = join(dir, IDENTITY_FILE)
  writeFileSync(file, `${JSON.stringify(identity, null, 2)}\n`)
  return file
}

export interface ResolveIdentityOptions {
  root: string
  /** `mfeId` from the plugin options. */
  optionMfeId?: string
  /** `mfeId` from `mfe.config.ts`. */
  configMfeId?: string
  /** package.json `name`, used for inference on the first run. */
  packageName?: string
  /** Skip writing the identity file (read-only tooling such as `platform manifest`). */
  persist?: boolean
}

/**
 * Explicit `mfeId` (option, then config) always wins and updates the persisted
 * identity; otherwise the persisted identity wins over inference, so renaming
 * the package never changes storage or command namespaces silently.
 */
export function resolveIdentity(options: ResolveIdentityOptions): ResolvedIdentity {
  const { root, persist = true } = options
  const file = join(platformDir(root), IDENTITY_FILE)
  const persisted = readIdentity(root)
  const explicit = options.optionMfeId ?? options.configMfeId
  if (explicit !== undefined) {
    const source: MfeIdSource = options.optionMfeId !== undefined ? "option" : "config"
    assertMfeId(explicit, source === "option" ? "platform() → mfeId" : "mfe.config.ts → mfeId")
    let written = false
    if (persist && persisted?.mfeId !== explicit) {
      writeIdentity(root, {
        mfeId: explicit,
        createdAt: persisted?.createdAt ?? new Date().toISOString(),
      })
      written = true
    }
    return { mfeId: explicit, source, file, written }
  }
  if (persisted) {
    assertMfeId(persisted.mfeId, `${PLATFORM_DIR}/${IDENTITY_FILE}`)
    return { mfeId: persisted.mfeId, source: "identity", file, written: false }
  }
  const inferred = inferMfeId(options.packageName ?? "mfe")
  assertMfeId(inferred, "package.json → name")
  if (persist) writeIdentity(root, { mfeId: inferred, createdAt: new Date().toISOString() })
  return { mfeId: inferred, source: "inferred", file, written: persist }
}
