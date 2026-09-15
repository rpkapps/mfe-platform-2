// Minimal cross-platform static file server used to serve built remotes
// (production artefacts) during E2E and local runs. CORS is open because
// remotes are loaded cross-origin by the shell, exactly as in production
// behind a CDN. Usage: node scripts/serve-static.mjs <dir> <port>
import { createServer } from "node:http"
import { createReadStream, existsSync, statSync } from "node:fs"
import { extname, join, normalize, resolve } from "node:path"

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
}

export function serveStatic(dir, port, { host = "127.0.0.1", cacheControl = "no-store" } = {}) {
  const root = resolve(dir)
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")
    let file = normalize(join(root, decodeURIComponent(url.pathname)))
    if (!file.startsWith(root)) {
      res.writeHead(403).end()
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html")
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Headers", "*")
    res.setHeader("Cache-Control", cacheControl)
    if (req.method === "OPTIONS") {
      res.writeHead(204).end()
      return
    }
    if (!existsSync(file)) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found")
      return
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" })
    createReadStream(file).pipe(res)
  })
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => resolvePromise(server))
  })
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())
) {
  const [dir, port] = process.argv.slice(2)
  if (!dir || !port) {
    console.error("usage: node scripts/serve-static.mjs <dir> <port>")
    process.exit(1)
  }
  serveStatic(dir, Number(port)).then(() =>
    console.log(`serving ${dir} on http://127.0.0.1:${port}`)
  )
}
