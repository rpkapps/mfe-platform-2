import { resolveRemoteUrl, type MfeManifest } from "@platform-internal/core"

/** Add or replace a query parameter on a URL (absolute or relative). */
export function withQuery(url: string, key: string, value: string): string {
  try {
    const parsed = new URL(url, "http://platform.invalid/")
    parsed.searchParams.set(key, value)
    return url.startsWith("http://platform.invalid") || /^[a-z][a-z0-9+.-]*:/i.test(url)
      ? parsed.href
      : `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    const separator = url.includes("?") ? "&" : "?"
    return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
  }
}

export interface EntryUrlOptions {
  manifestUrl: string
  dev?: boolean
  /** Append `?v=<buildId>` for production artefacts. */
  cacheBust?: boolean
  /** Append `?t=<now>` (retries, dev invalidation). */
  bustNow?: number
}

/**
 * Absolute URL of the remote entry: `remote.baseUrl + entry.file` resolved
 * against the manifest URL, or against `dev.origin` for development
 * manifests. Production artefacts carry `?v=<buildId>` so a new release is
 * never served from a stale cache; retries add `?t=<timestamp>`.
 */
export function computeEntryUrl(manifest: MfeManifest, options: EntryUrlOptions): string {
  const base = manifest.remote.baseUrl || "./"
  const relative = joinRemotePath(base, manifest.entry.file)
  const dev = options.dev ?? manifest.dev !== undefined
  const origin = dev ? manifest.dev?.origin : undefined
  const baseUrl = origin ? resolveRemoteUrl(origin.endsWith("/") ? origin : `${origin}/`, base) : undefined
  let url = baseUrl ? resolveRemoteUrl(baseUrl, manifest.entry.file) : resolveRemoteUrl(options.manifestUrl, relative)
  if (!dev && options.cacheBust !== false && manifest.release.buildId) {
    url = withQuery(url, "v", manifest.release.buildId)
  }
  if (options.bustNow !== undefined) url = withQuery(url, "t", String(options.bustNow))
  return url
}

export function joinRemotePath(base: string, file: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(file) || file.startsWith("/")) return file
  const cleanBase = base.endsWith("/") ? base : `${base}/`
  return `${cleanBase}${file.replace(/^\.\//, "")}`
}

/** `mfe_asset_tracker/./mfe` → `mfe_asset_tracker/mfe` (the runtime expects `name/expose`). */
export function exposeId(manifest: Pick<MfeManifest, "entry">): string {
  const expose = manifest.entry.expose.replace(/^\.\//, "").replace(/^\./, "")
  return `${manifest.entry.name}/${expose.replace(/^\//, "")}`
}

/** URL of the dev refresh preamble (React Refresh installer for the remote's React instance). */
export function refreshPreambleUrl(manifest: MfeManifest, manifestUrl: string): string | undefined {
  const preamble = manifest.dev?.refreshPreamble
  if (!preamble) return undefined
  const origin = manifest.dev?.origin
  return origin ? resolveRemoteUrl(origin.endsWith("/") ? origin : `${origin}/`, preamble) : resolveRemoteUrl(manifestUrl, preamble)
}
