// Production start: generate the runtime configuration from PLATFORM_* variables
// (what a Docker entrypoint does) and start the built server. Never rebuilds assets.
import { spawn, spawnSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const app = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = join(app, ".output", "public", "platform-config.json")
mkdirSync(dirname(out), { recursive: true })
const entrypoint = join(app, "..", "..", "packages", "host", "dist", "entrypoint.js")
const generated = spawnSync(process.execPath, [entrypoint, "--out", out], { stdio: "inherit" })
if (generated.status !== 0) process.exit(generated.status ?? 1)
const server = spawn(process.execPath, [join(app, ".output", "server", "index.mjs")], { stdio: "inherit", env: { ...process.env, PLATFORM_CONFIG_PATH: out, PORT: process.env.PORT ?? "4100" } })
server.on("exit", (code) => process.exit(code ?? 0))
