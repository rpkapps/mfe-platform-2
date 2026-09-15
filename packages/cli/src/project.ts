import { createRequire } from "node:module"
import { existsSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { inferMfeId, isValidMfeId } from "@platform-internal/core"

import { CliError } from "./errors"

export interface PackageJson {
  name?: string
  version?: string
  type?: string
  private?: boolean
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  [key: string]: unknown
}

/** Walk up from `start` to the closest directory holding a package.json. */
export function findProjectRoot(start: string): string | null {
  let current = resolve(start)
  for (;;) {
    if (existsSync(join(current, "package.json"))) return current
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

export function requireProjectRoot(cwd: string): string {
  const root = findProjectRoot(cwd)
  if (!root) {
    throw new CliError({ code: "PROJECT_NOT_FOUND", message: `No package.json found in ${cwd} or its parents.`, source: cwd, override: "--cwd <dir>" })
  }
  return root
}

export function readJsonFile<T = unknown>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T
}

export function readPackageJson(root: string): PackageJson {
  return readJsonFile<PackageJson>(join(root, "package.json"))
}

export function allDependencies(pkg: PackageJson): Record<string, string> {
  return { ...pkg.peerDependencies, ...pkg.devDependencies, ...pkg.dependencies }
}

/** `require` bound to the target project so every tool comes from the project's own node_modules. */
export function projectRequire(root: string): NodeJS.Require {
  return createRequire(join(root, "package.json"))
}

export function resolveProjectModule(root: string, specifier: string): string | null {
  try {
    return projectRequire(root).resolve(specifier)
  } catch {
    return null
  }
}

/** Dynamic import of a module from the project's node_modules, with a clear error when absent. */
export async function loadProjectModule<T = Record<string, unknown>>(root: string, specifier: string, purpose: string): Promise<T> {
  const resolved = resolveProjectModule(root, specifier)
  if (!resolved) {
    throw new CliError({
      code: "DEPENDENCY_MISSING",
      message: `Cannot find "${specifier}" from ${root}; it is required to ${purpose}.`,
      source: join(root, "package.json"),
      override: `pnpm add -D ${specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/")}`,
    })
  }
  return (await import(pathToFileURL(resolved).href)) as T
}

export function readProjectModuleVersion(root: string, packageName: string): string | null {
  try {
    const pkg = projectRequire(root)(`${packageName}/package.json`) as { version?: string }
    return pkg.version ?? null
  } catch {
    return null
  }
}

export interface Identity {
  mfeId: string
}

export const IDENTITY_FILE = join(".platform", "identity.json")

export function readIdentity(root: string): Identity | null {
  const file = join(root, IDENTITY_FILE)
  if (!existsSync(file)) return null
  try {
    const parsed = readJsonFile<Partial<Identity>>(file)
    return typeof parsed.mfeId === "string" ? { mfeId: parsed.mfeId } : null
  } catch {
    return null
  }
}

/** Effective mfeId: identity file → mfe.config → package name. */
export function resolveMfeId(root: string, configMfeId?: string): string {
  const identity = readIdentity(root)
  if (identity && isValidMfeId(identity.mfeId)) return identity.mfeId
  if (configMfeId && isValidMfeId(configMfeId)) return configMfeId
  const pkg = existsSync(join(root, "package.json")) ? readPackageJson(root) : {}
  return inferMfeId(pkg.name ?? "mfe")
}

export function fileMtime(file: string): number {
  try {
    return statSync(file).mtimeMs
  } catch {
    return -1
  }
}
