import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"

import { TECTON_PACKAGE } from "../resolve-config"

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s[^"'\n]*?from\s*["']([^"'./][^"']*)["']|(?:^|\n)\s*import\s*["']([^"'./][^"']*)["']/g
const SKIP = new Set(["react", "react-dom", TECTON_PACKAGE])
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"])

function packageName(specifier: string): string {
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry !== "node_modules" && entry !== "__tests__") yield* walk(path)
    } else if (SOURCE_EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) {
      if (!path.endsWith(".test.ts") && !path.endsWith(".test.tsx") && !path.endsWith(".d.ts"))
        yield path
    }
  }
}

const cache = new Map<string, string[]>()

function findPackageJson(root: string): string | undefined {
  let dir = root
  for (;;) {
    const candidate = join(dir, "node_modules", TECTON_PACKAGE, "package.json")
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * `optimizeDeps.include` entries for the JavaScript dependencies Tecton's
 * sources import (`@tecton/react > react-aria-components`, …).
 *
 * Tecton is a source package: its `.tsx` files are served as-is in
 * development, so their bare imports are resolved from inside `node_modules`,
 * where Vite's dev optimizer does not register newly discovered dependencies.
 * Left alone, `react-aria` and its CommonJS helpers (`use-sync-external-store`)
 * would be served raw and fail with "does not provide an export named …".
 * Pre-bundling them explicitly — in one optimizer run, so they share modules
 * with the React Aria copy the components use — keeps dev and build identical.
 */
export function tectonOptimizeIncludes(root: string): string[] {
  const cached = cache.get(root)
  if (cached) return cached
  const includes: string[] = []
  try {
    // Tecton's `exports` map does not expose package.json: walk node_modules up from the root.
    const packageJsonPath = findPackageJson(root)
    if (!packageJsonPath) return includes
    const packageDir = dirname(packageJsonPath)
    const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ])
    const sourceDir = join(packageDir, "src")
    if (!existsSync(sourceDir)) return includes
    const found = new Set<string>()
    for (const file of walk(sourceDir)) {
      const source = readFileSync(file, "utf8")
      for (const match of source.matchAll(IMPORT_RE)) {
        const specifier = match[1] ?? match[2]
        if (!specifier) continue
        const name = packageName(specifier)
        if (SKIP.has(name) || !declared.has(name)) continue
        // Subpath imports stay exact: packages such as `@shadcn/react` export no root entry.
        found.add(specifier)
      }
    }
    for (const specifier of [...found].sort()) includes.push(`${TECTON_PACKAGE} > ${specifier}`)
  } catch {
    // Tecton is not installed: nothing to pre-bundle.
  }
  cache.set(root, includes)
  return includes
}
