import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..")

/**
 * The platform never patches browser APIs. This scans the built SDK and host
 * bundles (what consumers install) for assignments to History and Storage
 * entry points. Listening to `popstate` and `storage` through addEventListener
 * is allowed (the shell's browser navigation and storage backend do that).
 */
const forbidden = [
  /history\.pushState\s*=/,
  /history\.replaceState\s*=/,
  /\b(window|globalThis|self)\.history\s*=/, // assigning window.history
  /Storage\.prototype\.\w+\s*=/,
  /localStorage\.\w+\s*=\s*function/,
  /sessionStorage\.\w+\s*=\s*function/,
  /defineProperty\([^)]*(history|localStorage|sessionStorage)/,
]

function bundles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith(".js") && !file.startsWith("entrypoint"))
    .map((file) => join(dir, file))
}

const targets = [
  ...bundles(join(root, "packages/react/dist")),
  ...bundles(join(root, "packages/host/dist")),
]

describe.skipIf(targets.length === 0)("built bundles never patch History or Storage", () => {
  for (const file of targets) {
    it(file.replace(root, "."), () => {
      const code = readFileSync(file, "utf8")
      for (const pattern of forbidden) {
        expect(code, `${pattern} found in ${file}`).not.toMatch(pattern)
      }
    })
  }
})
