import { requireProjectRoot, loadProjectModule } from "../project"
import { findViteConfig } from "../vite-config"

export interface DevOptions {
  cwd?: string
  port?: number
  host?: string | boolean
  open?: boolean
  /** Serve the local shell harness at `/__platform/harness/` (default true). */
  harness?: boolean
  log?: (message: string) => void
  /** Forward SIGINT/SIGTERM to the server (default true in the CLI). */
  signals?: boolean
}

export interface DevResult {
  /** The Vite dev server (`import("vite").ViteDevServer`). */
  server: {
    close(): Promise<void>
    printUrls(): void
    resolvedUrls: { local: string[]; network: string[] } | null
    config: { server: { port?: number } }
  }
  origin: string
  harnessUrl: string
  manifestUrl: string
  close(): Promise<void>
}

interface ViteModule {
  createServer(config: Record<string, unknown>): Promise<{
    listen(): Promise<unknown>
    close(): Promise<void>
    printUrls(): void
    resolvedUrls: { local: string[]; network: string[] } | null
    config: { server: { port?: number } }
  }>
}

/** `platform dev`: the project's own Vite dev server with its own vite.config, plus the harness URLs. */
export async function dev(options: DevOptions = {}): Promise<DevResult> {
  const root = requireProjectRoot(options.cwd ?? process.cwd())
  const log = options.log ?? ((message: string) => console.log(message))
  if (options.harness === false) process.env.PLATFORM_HARNESS = "false"
  const vite = await loadProjectModule<ViteModule>(root, "vite", "run the development server")
  const server = await vite.createServer({
    root,
    configFile: findViteConfig(root) ?? false,
    mode: "development",
    server: {
      ...(options.port ? { port: options.port, strictPort: true } : {}),
      ...(options.host !== undefined ? { host: options.host } : {}),
      ...(options.open !== undefined ? { open: options.open } : {}),
    },
  })
  await server.listen()
  const origin =
    server.resolvedUrls?.local[0]?.replace(/\/$/, "") ??
    `http://localhost:${server.config.server.port ?? 5173}`
  const harnessUrl = `${origin}/__platform/harness/`
  const manifestUrl = `${origin}/platform-manifest.json`
  server.printUrls()
  if (options.harness !== false) log(`  ➜  harness:   ${harnessUrl}`)
  log(`  ➜  manifest:  ${manifestUrl}  (use it as a manifest override in an SSR shell)`)

  const close = async () => {
    await server.close()
  }
  if (options.signals !== false) {
    const stop = () => {
      void close().finally(() => process.exit(0))
    }
    process.once("SIGINT", stop)
    process.once("SIGTERM", stop)
  }
  return { server, origin, harnessUrl, manifestUrl, close }
}
