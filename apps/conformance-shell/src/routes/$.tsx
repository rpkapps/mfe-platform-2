import { createFileRoute, useRouterState } from "@tanstack/react-router"
import { MfeOutlet } from "@platform/host/react"
import { mfeRouteHelpers } from "@platform/host/tanstack"
import { TEST_IDS } from "@platform-internal/conformance"

import { useShellHost } from "@/lib/platform"

/**
 * Catch-all: any path under a registered route prefix belongs to that MFE.
 * The shell owns the URL; the MFE router only sees the part under its prefix.
 */
export const Route = createFileRoute("/$")({
  component: MfeRoute,
})

function MfeRoute() {
  const host = useShellHost()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  if (!host) return <p className="text-sm text-muted-foreground">Starting platform…</p>
  const match = mfeRouteHelpers({ host }).matchMfeForPath(pathname)
  if (!match) {
    return (
      <main data-testid={TEST_IDS.shell.outletState} data-state="not-found" className="p-2">
        <h1 className="text-xl font-medium">404</h1>
        <p className="text-sm text-muted-foreground">No MFE owns {pathname}.</p>
      </main>
    )
  }
  return (
    <div data-testid={TEST_IDS.shell.outlet}>
      <MfeOutlet key={match.mfeId} mfeId={match.mfeId} routePrefix={match.routePrefix} />
    </div>
  )
}
