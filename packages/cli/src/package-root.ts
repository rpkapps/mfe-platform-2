import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

let cached: string | null = null

/** Root of the installed `@platform/cli` package (works from `src/` and from `dist/`). */
export function cliPackageRoot(): string {
  if (cached) return cached
  let current = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    const file = join(current, "package.json")
    if (existsSync(file)) {
      try {
        const pkg = JSON.parse(readFileSync(file, "utf8")) as { name?: string }
        if (pkg.name === "@platform/cli") {
          cached = current
          return current
        }
      } catch {
        // keep walking
      }
    }
    const parent = dirname(current)
    if (parent === current) throw new Error("Cannot locate the @platform/cli package root.")
    current = parent
  }
}

export function cliVersion(): string {
  const pkg = JSON.parse(readFileSync(join(cliPackageRoot(), "package.json"), "utf8")) as {
    version?: string
  }
  return pkg.version ?? "0.0.0"
}

export function templatesDir(): string {
  return join(cliPackageRoot(), "templates")
}
