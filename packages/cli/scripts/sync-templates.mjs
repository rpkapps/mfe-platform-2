// Regenerates templates/mfe/src/routeTree.gen.ts with the TanStack Router generator
// (the same generator @platform/vite runs) so the scaffold ships a correct, current
// route tree before its first `platform dev`. Cross-platform (Node only).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(here, "..")
const monorepoRoot = join(packageRoot, "..", "..")

function resolveGenerator() {
  const candidates = [join(packageRoot, "package.json"), join(monorepoRoot, "packages", "vite", "package.json"), join(monorepoRoot, "package.json")]
  for (const from of candidates) {
    try {
      const require = createRequire(from)
      let pluginDir
      try {
        pluginDir = dirname(require.resolve("@tanstack/router-plugin/package.json"))
      } catch {
        pluginDir = undefined
      }
      const nested = pluginDir ? createRequire(join(pluginDir, "package.json")) : require
      return nested.resolve("@tanstack/router-generator")
    } catch {
      // try the next location
    }
  }
  throw new Error("Cannot resolve @tanstack/router-generator; run pnpm install in the monorepo first.")
}

const generatorPath = resolveGenerator()
const { Generator, getConfig } = await import(pathToFileURL(generatorPath).href)

const work = mkdtempSync(join(tmpdir(), "platform-template-routes-"))
try {
  const routesDirectory = join(work, "src", "routes")
  cpSync(join(packageRoot, "templates", "mfe", "src", "routes"), routesDirectory, { recursive: true })
  const generatedRouteTree = join(work, "src", "routeTree.gen.ts")
  const config = getConfig({ target: "react", autoCodeSplitting: true, routesDirectory, generatedRouteTree, disableLogging: true }, work)
  await new Generator({ config, root: work }).run()
  const output = readFileSync(generatedRouteTree, "utf8")
  const target = join(packageRoot, "templates", "mfe", "src", "routeTree.gen.ts")
  writeFileSync(target, output)
  console.log(`Wrote ${target} (${output.split("\n").length} lines)`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
