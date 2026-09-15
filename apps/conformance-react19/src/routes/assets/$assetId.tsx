import { createFileRoute, redirect } from "@tanstack/react-router"
import { TEST_IDS } from "@platform-internal/conformance"

import { Badge } from "@tecton/react/components/badge"

import { loadAsset } from "@/lib/data"

const ids = TEST_IDS.assetTracker

// Native TanStack guard: the platform context is ordinary route context.
export const Route = createFileRoute("/assets/$assetId")({
  staticData: { breadcrumb: { fromLoader: "breadcrumb" }, permissionGroups: ["assets:read"] },
  beforeLoad: ({ context, params }) => {
    if (!context.platform.permissions.hasGroup("assets:read")) {
      throw redirect({ to: "/", search: { denied: params.assetId } })
    }
    if (params.assetId === "restricted" && !context.platform.permissions.hasGroup("admin")) {
      throw new Error(
        "Only admins may open the restricted asset (guard error stays inside the MFE)."
      )
    }
  },
  loader: async ({ params, context, abortController }) => {
    const span = context.platform.telemetry.span("asset.load", { assetId: params.assetId })
    try {
      const asset = await loadAsset(params.assetId, abortController.signal)
      span.end()
      return { asset, breadcrumb: asset.name }
    } catch (error) {
      span.fail(error)
      throw error
    }
  },
  pendingComponent: () => <p className="text-muted-foreground text-sm">Loading asset…</p>,
  errorComponent: ({ error }: { error: unknown }) => (
    <p role="alert" data-testid={ids.guardMessage} className="text-destructive text-sm">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ),
  component: AssetDetail,
})

function AssetDetail() {
  const { asset } = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-2">
      <h2 data-testid={ids.assetTitle} className="text-lg font-medium">
        {asset.name}
      </h2>
      <p className="text-muted-foreground text-sm">
        {asset.site} · <Badge appearance="outline">{asset.status}</Badge>
      </p>
    </div>
  )
}
