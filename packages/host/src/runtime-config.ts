import {
  isPlatformError,
  parseRuntimeConfig,
  PlatformError,
  type DiagnosticSink,
  type RuntimeConfig,
} from "@platform-internal/core"

export interface LoadRuntimeConfigOptions {
  /** Inline document (SSR `<script id="platform-config" type="application/json">` or `window.__PLATFORM_CONFIG__`). */
  inline?: unknown
  /** Same-origin JSON URL (default `/platform-config.json`). `null` disables fetching. */
  url?: string | null
  fetch?: typeof fetch
  /** Used when nothing else is available (default `{}` → schema defaults). */
  fallback?: unknown
  diagnostics?: DiagnosticSink
  /** Document to read the inline script from (default `document`). */
  document?: Document
  /** Window to read `__PLATFORM_CONFIG__` from (default `window`). */
  window?: Window & { __PLATFORM_CONFIG__?: unknown }
  signal?: AbortSignal
}

export const RUNTIME_CONFIG_SCRIPT_ID = "platform-config"
export const RUNTIME_CONFIG_URL = "/platform-config.json"

/** Inline document from the SSR script tag or the global, when present. */
export function readInlineRuntimeConfig(
  options: Pick<LoadRuntimeConfigOptions, "document" | "window"> = {}
): { value: unknown; source: "inline-script" | "inline-global" } | undefined {
  const doc = options.document ?? (typeof document !== "undefined" ? document : undefined)
  const script = doc?.getElementById(RUNTIME_CONFIG_SCRIPT_ID)
  if (script && script.textContent && script.textContent.trim()) {
    try {
      return { value: JSON.parse(script.textContent), source: "inline-script" }
    } catch (error) {
      throw new PlatformError({
        code: "RUNTIME_CONFIG_INVALID",
        message: `The inline runtime configuration (#${RUNTIME_CONFIG_SCRIPT_ID}) is not valid JSON.`,
        source: `#${RUNTIME_CONFIG_SCRIPT_ID}`,
        cause: error,
      })
    }
  }
  const win =
    options.window ??
    (typeof window !== "undefined" ? (window as LoadRuntimeConfigOptions["window"]) : undefined)
  if (win && win.__PLATFORM_CONFIG__ !== undefined)
    return { value: win.__PLATFORM_CONFIG__, source: "inline-global" }
  return undefined
}

/**
 * Load the runtime configuration: inline document → same-origin fetch
 * (`cache: "no-store"`, 404 tolerated) → fallback → schema validation. The
 * effective source is recorded in `config.source`.
 */
export async function loadRuntimeConfig(
  options: LoadRuntimeConfigOptions = {}
): Promise<RuntimeConfig> {
  const diagnostics = options.diagnostics
  let raw: unknown
  let source: string
  if (options.inline !== undefined) {
    raw = options.inline
    source = "inline"
  } else {
    const inline = readInlineRuntimeConfig(options)
    if (inline) {
      raw = inline.value
      source = inline.source
    } else {
      const url = options.url === undefined ? RUNTIME_CONFIG_URL : options.url
      const fetchImpl = options.fetch ?? (typeof fetch === "function" ? fetch : undefined)
      if (url && fetchImpl) {
        try {
          const response = await fetchImpl(url, {
            cache: "no-store",
            credentials: "same-origin",
            signal: options.signal,
          })
          if (response.status === 404) {
            diagnostics?.emit({
              type: "log",
              level: "warn",
              message: `Runtime configuration not found at ${url}; using ${options.fallback !== undefined ? "the fallback document" : "defaults"}.`,
            })
            raw = options.fallback ?? {}
            source = "fallback"
          } else if (!response.ok) {
            throw new PlatformError({
              code: "RUNTIME_CONFIG_FETCH_FAILED",
              message: `Fetching ${url} failed with HTTP ${response.status}.`,
              source: url,
            })
          } else {
            raw = await response.json()
            source = "fetch"
          }
        } catch (error) {
          if (isPlatformError(error)) throw error
          throw new PlatformError({
            code: "RUNTIME_CONFIG_FETCH_FAILED",
            message: `Fetching ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
            source: url,
            cause: error,
          })
        }
      } else {
        raw = options.fallback ?? {}
        source = "fallback"
      }
    }
  }
  const config = parseRuntimeConfig(raw, source)
  diagnostics?.emit({
    type: "runtime-config.loaded",
    source: config.source ?? source,
    environment: config.environment,
  })
  return config
}

/** Keys whose values differ between two configurations (`mfes.<id>.enabled`, `mfes.<id>.manifestUrl`, …). */
export function diffRuntimeConfig(previous: RuntimeConfig, next: RuntimeConfig): string[] {
  const changes: string[] = []
  if (previous.environment !== next.environment) changes.push("environment")
  if (JSON.stringify(previous.shared) !== JSON.stringify(next.shared)) changes.push("shared")
  if (JSON.stringify(previous.allowedOrigins) !== JSON.stringify(next.allowedOrigins))
    changes.push("allowedOrigins")
  if (JSON.stringify(previous.devtools) !== JSON.stringify(next.devtools))
    changes.push("devtools")
  const ids = new Set([...Object.keys(previous.mfes), ...Object.keys(next.mfes)])
  for (const id of ids) {
    const a = previous.mfes[id] ?? { env: {} }
    const b = next.mfes[id] ?? { env: {} }
    const before = changes.length
    if (a.enabled !== b.enabled) changes.push(`mfes.${id}.enabled`)
    if (a.manifestUrl !== b.manifestUrl) changes.push(`mfes.${id}.manifestUrl`)
    if (a.preload !== b.preload) changes.push(`mfes.${id}.preload`)
    if (JSON.stringify(a.env) !== JSON.stringify(b.env)) changes.push(`mfes.${id}.env`)
    if (JSON.stringify(a.allowedOrigins) !== JSON.stringify(b.allowedOrigins))
      changes.push(`mfes.${id}.allowedOrigins`)
    if (changes.length === before && !previous.mfes[id] !== !next.mfes[id])
      changes.push(`mfes.${id}`)
  }
  return changes
}
