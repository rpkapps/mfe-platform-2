import { createFileRoute, redirect } from "@tanstack/react-router"

import { fetchAsset } from "@/lib/api"

/**
 * Native TanStack guard: the platform context is ordinary route context. The manifest
 * lists `permissionGroups` so the shell can preflight, but the guard is what enforces it.
 * The loader publishes the breadcrumb label through `staticData.breadcrumb.fromLoader`.
 */
export const Route = createFileRoute("/assets/$assetId")({
  staticData: { breadcrumb: { fromLoader: "breadcrumb" }, permissionGroups: ["assets:read"] },
  beforeLoad: ({ context, params }) => {
    if (!context.platform.permissions.hasGroup("assets:read")) {
      throw redirect({ to: "/", search: { denied: params.assetId } })
    }
  },
  loader: async ({ context, params, abortController }) => {
    const span = context.platform.telemetry.span("asset.load", { assetId: params.assetId })
    try {
      const asset = await fetchAsset(
        context.platform.runtime.env.API_BASE_URL,
        params.assetId,
        abortController.signal
      )
      span.end()
      return { asset, breadcrumb: asset.name }
    } catch (error) {
      span.fail(error)
      throw error
    }
  },
  pendingComponent: () => <p className="text-muted-foreground text-sm">Loading asset…</p>,
  errorComponent: ({ error }: { error: unknown }) => (
    <p role="alert" className="text-destructive text-sm">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ),
  component: AssetDetail,
})

function AssetDetail() {
  const { asset } = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">{asset.name}</h2>
      <p className="text-muted-foreground text-sm">
        {asset.site} · {asset.status}
      </p>
    </div>
  )
}
