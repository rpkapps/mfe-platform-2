import { createFileRoute, redirect } from "@tanstack/react-router"

import { fetchWell } from "@/lib/api"

/**
 * Native TanStack guard: the platform context is ordinary route context. The manifest
 * lists `permissionGroups` so the shell can preflight, but the guard is what enforces it.
 * The loader publishes the breadcrumb label through `staticData.breadcrumb.fromLoader`.
 */
export const Route = createFileRoute("/wells/$wellId")({
  staticData: { breadcrumb: { fromLoader: "breadcrumb" }, permissionGroups: ["wells:read"] },
  beforeLoad: ({ context, params }) => {
    if (!context.platform.permissions.hasGroup("wells:read")) {
      throw redirect({ to: "/", search: { denied: params.wellId } })
    }
  },
  loader: async ({ context, params, abortController }) => {
    const span = context.platform.telemetry.span("well.load", { wellId: params.wellId })
    try {
      const well = await fetchWell(
        context.platform.fetch,
        context.platform.runtime.env.API_BASE_URL,
        params.wellId,
        abortController.signal
      )
      span.end()
      return { well, breadcrumb: well.name }
    } catch (error) {
      span.fail(error)
      throw error
    }
  },
  pendingComponent: () => <p className="text-muted-foreground text-sm">Loading well…</p>,
  errorComponent: ({ error }: { error: unknown }) => (
    <p role="alert" className="text-destructive text-sm">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ),
  component: WellDetail,
})

function WellDetail() {
  const { well } = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">{well.name}</h2>
      <p className="text-muted-foreground text-sm">
        {well.field} · {well.status}
      </p>
    </div>
  )
}
