import {
  PlatformError,
  validateManifest,
  type DiagnosticSink,
  type MfeManifest,
  type RuntimeConfig,
  type StorageBackend,
} from "@platform-internal/core"

import type { ManifestUrlResolution, RegistryEntry } from "./types"

export const MANIFEST_OVERRIDES_KEY = "platform:manifest-overrides"
export const MANIFEST_QUERY_PREFIX = "platform.override."

export function defaultManifestUrl(mfeId: string): string {
  return `/mfes/${mfeId}/platform-manifest.json`
}

function readJsonRecord(storage: StorageBackend, scope: "local" | "session"): Record<string, string> {
  try {
    const raw = storage.get(scope, MANIFEST_OVERRIDES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return {}
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === "string")) as Record<string, string>
  } catch {
    return {}
  }
}

function writeJsonRecord(storage: StorageBackend, scope: "local" | "session", record: Record<string, string>) {
  try {
    if (Object.keys(record).length === 0) storage.remove(scope, MANIFEST_OVERRIDES_KEY)
    else storage.set(scope, MANIFEST_OVERRIDES_KEY, JSON.stringify(record))
  } catch {
    // storage may be blocked; overrides then live for this page only
  }
}

/** Explicit local overrides: query (`?platform.override.<mfeId>=`) persisted to session storage, and local storage. */
export interface OverrideStore {
  /** `?platform.override.<id>` values, persisted to session storage on first read. */
  query(): Record<string, string>
  local(): Record<string, string>
  setLocal(mfeId: string, url: string | null): void
}

export function createOverrideStore(options: { storage: StorageBackend; search?: string }): OverrideStore {
  const { storage } = options
  const fromQuery: Record<string, string> = {}
  const search = options.search ?? (typeof window !== "undefined" ? window.location.search : "")
  if (search) {
    try {
      const params = new URLSearchParams(search)
      for (const [key, value] of params.entries()) {
        if (key.startsWith(MANIFEST_QUERY_PREFIX) && value) fromQuery[key.slice(MANIFEST_QUERY_PREFIX.length)] = value
      }
    } catch {
      // ignore malformed query strings
    }
  }
  if (Object.keys(fromQuery).length) writeJsonRecord(storage, "session", { ...readJsonRecord(storage, "session"), ...fromQuery })
  return {
    query: () => ({ ...readJsonRecord(storage, "session"), ...fromQuery }),
    local: () => readJsonRecord(storage, "local"),
    setLocal(mfeId, url) {
      const record = readJsonRecord(storage, "local")
      if (url) record[mfeId] = url
      else delete record[mfeId]
      writeJsonRecord(storage, "local", record)
    },
  }
}

export interface ResolveManifestUrlInput {
  mfeId: string
  overrides: OverrideStore
  runtimeConfig: RuntimeConfig
  registry?: RegistryEntry
  defaultUrl?: (mfeId: string) => string
}

/** Precedence: query > local override > runtime configuration > registry > generated default. */
export function resolveManifestUrl(input: ResolveManifestUrlInput): ManifestUrlResolution {
  const { mfeId } = input
  const query = input.overrides.query()[mfeId]
  if (query) return { url: query, source: "query" }
  const local = input.overrides.local()[mfeId]
  if (local) return { url: local, source: "override" }
  const fromConfig = input.runtimeConfig.mfes[mfeId]?.manifestUrl
  if (fromConfig) return { url: fromConfig, source: "runtime-config" }
  if (input.registry?.manifestUrl) return { url: input.registry.manifestUrl, source: "registry" }
  return { url: (input.defaultUrl ?? defaultManifestUrl)(mfeId), source: "default" }
}

export function originOf(url: string, base?: string): string | null {
  try {
    return new URL(url, base ?? (typeof window !== "undefined" ? window.location.href : "http://localhost/")).origin
  } catch {
    return null
  }
}

export interface OriginPolicyInput {
  url: string
  mfeId: string
  /** The shell origin (same-origin is always allowed). */
  origin: string
  runtimeConfig: RuntimeConfig
  registry?: RegistryEntry
  policyOrigins?: string[]
  manifestOrigins?: string[]
  /** What is being validated (for the error message). */
  kind: "manifest" | "entry"
}

/** Throws `MANIFEST_ORIGIN_DENIED` unless the URL's origin is same-origin or allow-listed. */
export function assertOriginAllowed(input: OriginPolicyInput): string {
  const origin = originOf(input.url, input.origin)
  if (!origin) throw new PlatformError({ code: "MANIFEST_ORIGIN_DENIED", message: `"${input.url}" is not a valid URL.`, owner: { mfeId: input.mfeId }, source: input.url })
  const normalize = (value: string) => originOf(value, input.origin)
  const allowed = new Set<string | null>([input.origin])
  for (const value of input.runtimeConfig.allowedOrigins) allowed.add(normalize(value))
  for (const value of input.runtimeConfig.mfes[input.mfeId]?.allowedOrigins ?? []) allowed.add(normalize(value))
  for (const value of input.policyOrigins ?? []) allowed.add(normalize(value))
  for (const value of input.manifestOrigins ?? []) allowed.add(normalize(value))
  if (input.registry?.manifestUrl) allowed.add(normalize(input.registry.manifestUrl))
  if (allowed.has(origin)) return origin
  throw new PlatformError({
    code: "MANIFEST_ORIGIN_DENIED",
    message: `The ${input.kind} URL for ${input.mfeId} points at ${origin}, which is neither the shell origin nor an allowed origin.`,
    owner: { mfeId: input.mfeId },
    source: input.url,
    override: "PLATFORM_ALLOWED_ORIGINS or `mfes.<mfeId>.allowedOrigins` in the runtime configuration",
    details: { origin, allowed: Array.from(allowed).filter(Boolean) },
  })
}

export interface FetchManifestOptions {
  url: string
  mfeId: string
  fetch: typeof fetch
  attempts: number
  backoffMs: number
  bustOnRetry: boolean
  noStore: boolean
  signal?: AbortSignal
  diagnostics?: DiagnosticSink
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Fetch and validate a manifest with retry, backoff and cache-busting. */
export async function fetchManifest(options: FetchManifestOptions): Promise<{ manifest: MfeManifest; url: string; attempts: number }> {
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  let lastError: PlatformError | undefined
  for (let attempt = 1; attempt <= options.attempts + 1; attempt += 1) {
    if (options.signal?.aborted) throw new PlatformError({ code: "MANIFEST_FETCH_FAILED", message: `Loading the manifest of ${options.mfeId} was aborted.`, owner: { mfeId: options.mfeId }, source: options.url, details: { aborted: true } })
    let url = options.url
    if (attempt > 1 && options.bustOnRetry) {
      const separator = url.includes("?") ? "&" : "?"
      url = `${url}${separator}t=${now()}`
    }
    try {
      const response = await options.fetch(url, { cache: options.noStore || attempt > 1 ? "no-store" : "default", credentials: "same-origin", signal: options.signal })
      if (!response.ok) throw new PlatformError({ code: "MANIFEST_FETCH_FAILED", message: `HTTP ${response.status} while fetching the manifest of ${options.mfeId}.`, owner: { mfeId: options.mfeId }, source: url, details: { status: response.status, attempt } })
      let json: unknown
      try {
        json = await response.json()
      } catch (error) {
        throw new PlatformError({ code: "MANIFEST_INVALID", message: `The manifest of ${options.mfeId} is not valid JSON.`, owner: { mfeId: options.mfeId }, source: url, cause: error, details: { fatal: true } })
      }
      const result = validateManifest(json)
      if (!result.ok) {
        throw new PlatformError({
          code: "MANIFEST_INVALID",
          message: `The manifest of ${options.mfeId} is invalid: ${result.issues.map((issue) => `${issue.path || "<root>"}: ${issue.message}`).join("; ")}`,
          owner: { mfeId: options.mfeId },
          source: url,
          details: { issues: result.issues, fatal: true },
        })
      }
      if (result.manifest.mfeId !== options.mfeId) {
        throw new PlatformError({ code: "MANIFEST_INVALID", message: `The manifest at ${url} belongs to "${result.manifest.mfeId}", not "${options.mfeId}".`, owner: { mfeId: options.mfeId }, source: url, details: { fatal: true } })
      }
      return { manifest: result.manifest, url, attempts: attempt }
    } catch (error) {
      const platformError = error instanceof PlatformError ? error : new PlatformError({ code: "MANIFEST_FETCH_FAILED", message: `Fetching the manifest of ${options.mfeId} failed: ${error instanceof Error ? error.message : String(error)}`, owner: { mfeId: options.mfeId }, source: url, cause: error, details: { attempt } })
      lastError = platformError
      options.diagnostics?.emit({ type: "manifest.failed", url, attempt, error: platformError.toJSON(), mfeId: options.mfeId })
      if (platformError.details?.fatal || platformError.details?.aborted || attempt > options.attempts) break
      const delay = options.backoffMs * 2 ** (attempt - 1)
      options.diagnostics?.emit({ type: "manifest.retry", url, attempt, delayMs: delay, mfeId: options.mfeId })
      if (delay > 0) await sleep(delay)
    }
  }
  throw lastError!
}
