// Starts every conformance remote's development server plus the SSR shell in
// development mode with runtime configuration pointing at the local remotes:
// `pnpm dev:conformance`. Cross-platform (spawns pnpm through the shell on Windows).
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { conformanceEnv } from "./conformance-env.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const shell = process.platform === "win32"
const env = { ...process.env, ...conformanceEnv({ mode: "development" }) }

const apps = [
  ["@conformance/well-planner", "dev"],
  ["@conformance/production-reports", "dev"],
  ["@conformance/subsurface-widgets", "dev"],
  ["@conformance/field-widgets", "dev"],
  ["conformance-shell", "dev"],
]

const children = apps.map(([filter, script]) => {
  const child = spawn("pnpm", ["--filter", filter, script], {
    cwd: root,
    env,
    stdio: "inherit",
    shell,
  })
  child.on("exit", (code) => {
    if (code && code !== 0) console.error(`${filter} exited with ${code}`)
  })
  return child
})

const stop = () => {
  for (const child of children) child.kill()
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
console.log("conformance shell (dev): http://127.0.0.1:4110  — remotes on 4201-4204")
