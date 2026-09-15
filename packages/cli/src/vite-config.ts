import { existsSync } from "node:fs"
import { join } from "node:path"

const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs", "vite.config.cts", "vite.config.cjs"]

export function findViteConfig(root: string): string | undefined {
  return VITE_CONFIG_FILES.map((name) => join(root, name)).find((file) => existsSync(file))
}
