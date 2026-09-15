import { ASSETS, type Asset } from "@platform-internal/conformance"

export function listAssets(): Asset[] {
  return ASSETS
}

export async function loadAsset(assetId: string, signal?: AbortSignal): Promise<Asset> {
  await new Promise((resolve) => setTimeout(resolve, 30))
  if (signal?.aborted) throw new Error("aborted")
  const asset = ASSETS.find((candidate) => candidate.id === assetId)
  if (!asset) throw new Error(`Unknown asset ${assetId}`)
  return asset
}
