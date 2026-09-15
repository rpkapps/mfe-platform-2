import { createRequire } from "node:module"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve, sep } from "node:path"

export interface PackageJson {
  name?: string
  version?: string
  description?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export function readJsonFile<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T
  } catch {
    return undefined
  }
}

export function readPackageJson(root: string): PackageJson {
  return readJsonFile<PackageJson>(join(root, "package.json")) ?? {}
}

/**
 * Locate `node_modules/<name>/package.json` for a package as seen from `root`.
 * `require.resolve` first (respects pnpm symlinks); packages whose `exports`
 * hide their package.json are found by walking the directory tree.
 */
export function findPackageJson(root: string, name: string): string | undefined {
  const ancestors = ancestorDirectories(root)
  const require = createRequire(join(root, "package.json"))
  try {
    const resolved = require.resolve(`${name}/package.json`)
    // Only trust resolutions from a node_modules directory of the project or its ancestors
    // (test runners hook Node's resolver and may find packages that the project does not have).
    if (ancestors.some((dir) => resolved.startsWith(join(dir, "node_modules") + sep)))
      return resolved
  } catch {
    /* exports map may hide package.json */
  }
  for (const dir of ancestors) {
    const candidate = join(dir, "node_modules", name, "package.json")
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function ancestorDirectories(root: string): string[] {
  const dirs: string[] = []
  let dir = resolve(root)
  for (;;) {
    dirs.push(dir)
    const parent = dirname(dir)
    if (parent === dir) return dirs
    dir = parent
  }
}

export function installedVersion(root: string, name: string): string | undefined {
  const file = findPackageJson(root, name)
  if (!file) return undefined
  return readJsonFile<PackageJson>(file)?.version
}

export function isPackageResolvable(root: string, name: string): boolean {
  return findPackageJson(root, name) !== undefined
}

/** Installed versions of every listed package (`name → x.y.z`), omitting missing ones. */
export function installedVersions(
  root: string,
  names: Iterable<string>
): Record<string, string> {
  const versions: Record<string, string> = {}
  for (const name of names) {
    const version = installedVersion(root, name)
    if (version) versions[name] = version
  }
  return versions
}
