import { createFileRoute, Link } from "@tanstack/react-router"

import { fetchAssets } from "@/lib/api"

export const Route = createFileRoute("/assets/")({
  staticData: {
    breadcrumb: "Assets",
    navigation: {
      title: "Assets",
      description: "All tracked assets",
      keywords: ["list"],
      order: 1,
    },
  },
  // Loaders read the runtime env through the route context; they re-run when the context changes.
  loader: ({ context, abortController }) =>
    fetchAssets(context.platform.runtime.env.API_BASE_URL, abortController.signal),
  component: AssetList,
})

function AssetList() {
  const assets = Route.useLoaderData()
  return (
    <ul className="divide-border flex flex-col divide-y text-sm">
      {assets.map((asset) => (
        <li key={asset.id} className="flex items-center gap-3 py-2">
          <span className="asset-status-dot bg-current" data-status={asset.status} />
          <Link
            to="/assets/$assetId"
            params={{ assetId: asset.id }}
            className="underline-offset-4 hover:underline"
          >
            {asset.name}
          </Link>
          <span className="text-muted-foreground ml-auto">{asset.site}</span>
        </li>
      ))}
    </ul>
  )
}
