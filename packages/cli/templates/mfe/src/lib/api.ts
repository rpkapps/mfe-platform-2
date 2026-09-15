import { useRuntimeEnv } from "@platform/react"

/**
 * Data access. The API base URL is a runtime environment value (mfe.config.ts → env,
 * injected per deployment by the host) read with `useRuntimeEnv()` in components and
 * `context.platform.runtime.env` in loaders. Sample data keeps the harness working
 * without a backend.
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

export const SAMPLE_ASSETS: Asset[] = [
  { id: "pump-1", name: "Pump 1", status: "online", site: "North Field" },
  { id: "valve-7", name: "Valve 7", status: "maintenance", site: "North Field" },
  { id: "compressor-2", name: "Compressor 2", status: "offline", site: "South Field" },
]

export const SAMPLE_REGIONS: Region[] = [
  { id: "eu", name: "Europe" },
  { id: "us", name: "United States" },
  { id: "apac", name: "Asia Pacific" },
]

async function getJson<T>(
  url: string,
  signal: AbortSignal | undefined,
  fallback: T
): Promise<T> {
  try {
    const response = await fetch(url, { signal, headers: { accept: "application/json" } })
    if (!response.ok) return fallback
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    return fallback
  }
}

export function fetchAssets(baseUrl: string, signal?: AbortSignal): Promise<Asset[]> {
  return getJson(`${baseUrl}/assets`, signal, SAMPLE_ASSETS)
}

export async function fetchAsset(
  baseUrl: string,
  assetId: string,
  signal?: AbortSignal
): Promise<Asset> {
  const fallback = SAMPLE_ASSETS.find((asset) => asset.id === assetId)
  const asset = await getJson<Asset | null>(
    `${baseUrl}/assets/${encodeURIComponent(assetId)}`,
    signal,
    fallback ?? null
  )
  if (!asset) throw new Error(`Asset "${assetId}" was not found.`)
  return asset
}

export function fetchRegions(baseUrl: string, signal?: AbortSignal): Promise<Region[]> {
  return getJson(`${baseUrl}/regions`, signal, SAMPLE_REGIONS)
}

/** Hook form for components: the base URL comes from the typed runtime env. */
export function useApiBaseUrl(): string {
  return useRuntimeEnv().API_BASE_URL
}
