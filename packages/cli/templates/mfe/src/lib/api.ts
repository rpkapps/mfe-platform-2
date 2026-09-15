import {
  PlatformError,
  usePlatformFetch,
  useRuntimeEnv,
  type PlatformFetch,
} from "@platform/mfe-react"

/**
 * Data access. The API base URL is a runtime environment value
 * (mfe.config.ts → env, injected per deployment by the host) read with
 * `useRuntimeEnv()` in components and `context.platform.runtime.env` in loaders.
 *
 * Every call goes through the platform fetch, which attaches the shell's access
 * token. Nothing here ever returns stand-in data for a failed request: a route
 * that cannot load its data renders its `errorComponent`, so a 401 looks like a
 * 401 instead of three plausible-looking rows.
 */
export interface Asset {
  id: string
  name: string
  status: "online" | "offline" | "maintenance"
  site: string
}

export interface Region {
  id: string
  name: string
}

async function getJson<T>(
  platformFetch: PlatformFetch,
  url: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await platformFetch(url, {
    signal,
    audience: "api",
    headers: { accept: "application/json" },
  })
  if (!response.ok) {
    throw new PlatformError({
      code: "INTERNAL",
      message: `${url} responded ${response.status} ${response.statusText}.`,
      source: url,
    })
  }
  return (await response.json()) as T
}

export function fetchAssets(
  platformFetch: PlatformFetch,
  baseUrl: string,
  signal?: AbortSignal
): Promise<Asset[]> {
  return getJson<Asset[]>(platformFetch, `${baseUrl}/assets`, signal)
}

export function fetchAsset(
  platformFetch: PlatformFetch,
  baseUrl: string,
  assetId: string,
  signal?: AbortSignal
): Promise<Asset> {
  return getJson<Asset>(
    platformFetch,
    `${baseUrl}/assets/${encodeURIComponent(assetId)}`,
    signal
  )
}

export function fetchRegions(
  platformFetch: PlatformFetch,
  baseUrl: string,
  signal?: AbortSignal
): Promise<Region[]> {
  return getJson<Region[]>(platformFetch, `${baseUrl}/regions`, signal)
}

/** Hook form for components: the base URL comes from the typed runtime env. */
export function useApiBaseUrl(): string {
  return useRuntimeEnv().API_BASE_URL
}

/** Everything a component needs to call the API: the base URL and an authenticated fetch. */
export function useApi(): { baseUrl: string; fetch: PlatformFetch } {
  return { baseUrl: useApiBaseUrl(), fetch: usePlatformFetch() }
}
