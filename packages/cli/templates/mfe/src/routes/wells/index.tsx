import { createFileRoute, Link } from "@tanstack/react-router"

import { fetchWells } from "@/lib/api"

export const Route = createFileRoute("/wells/")({
  staticData: {
    breadcrumb: "Wells",
    navigation: {
      title: "Wells",
      description: "All tracked wells",
      keywords: ["list"],
      order: 1,
    },
  },
  // Loaders read the runtime env and the authenticated fetch through the route
  // context; they re-run when the context changes.
  loader: ({ context, abortController }) =>
    fetchWells(
      context.platform.fetch,
      context.platform.runtime.env.API_BASE_URL,
      abortController.signal
    ),
  // A failed load renders here rather than being replaced by stand-in data.
  errorComponent: ({ error }: { error: unknown }) => (
    <p role="alert" className="text-destructive text-sm">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ),
  pendingComponent: () => <p className="text-muted-foreground text-sm">Loading wells…</p>,
  component: WellList,
})

function WellList() {
  const wells = Route.useLoaderData()
  return (
    <ul className="divide-border flex flex-col divide-y text-sm">
      {wells.map((well) => (
        <li key={well.id} className="flex items-center gap-3 py-2">
          <span className="well-status-dot bg-current" data-status={well.status} />
          <Link
            to="/wells/$wellId"
            params={{ wellId: well.id }}
            className="underline-offset-4 hover:underline"
          >
            {well.name}
          </Link>
          <span className="text-muted-foreground ml-auto">{well.field}</span>
        </li>
      ))}
    </ul>
  )
}
