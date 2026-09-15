// Production start: generate the runtime configuration from PLATFORM_* variables
// (what a Docker entrypoint does) and serve the built SSR shell. Assets are never rebuilt.
import { spawn, spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const app = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = join(app, "dist", "client", "platform-config.json")
mkdirSync(dirname(out), { recursive: true })
const entrypoint = join(app, "..", "..", "packages", "host", "dist", "entrypoint.js")
const generated = spawnSync(process.execPath, [entrypoint, "--out", out], { stdio: "inherit" })
if (generated.status !== 0) process.exit(generated.status ?? 1)
const vite = join(app, "..", "..", "node_modules", "vite", "bin", "vite.js")
const port = process.env.PORT ?? "4100"
const server = spawn(
  process.execPath,
  [vite, "preview", "--port", port, "--strictPort", "--host", process.env.HOST ?? "0.0.0.0"],
  { cwd: app, stdio: "inherit", env: { ...process.env, PLATFORM_CONFIG_PATH: out } }
)
server.on("exit", (code) => process.exit(code ?? 0))
