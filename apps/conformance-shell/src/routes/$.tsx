import { createFileRoute, useRouterState } from "@tanstack/react-router"
import { MfeOutlet } from "@platform/host-react"
import { mfeRouteHelpers } from "@platform/host-react/tanstack"
import { TEST_IDS } from "@platform-internal/conformance"

import { PageState } from "@/components"
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
  if (!host) return <p className="text-muted-foreground text-sm">Starting platform…</p>
  const match = mfeRouteHelpers({ host }).matchMfeForPath(pathname)
  if (!match) {
    return (
      <main data-testid={TEST_IDS.shell.outletState} data-state="not-found">
        <PageState
          code="404"
          title="Nothing at this address"
          description={
            <>
              No application owns <code className="font-mono">{pathname}</code>. It may have
              moved, or the remote that served it is no longer registered.
            </>
          }
        />
      </main>
    )
  }
  return (
    <div data-testid={TEST_IDS.shell.outlet}>
      <MfeOutlet key={match.mfeId} mfeId={match.mfeId} routePrefix={match.routePrefix} />
    </div>
  )
}
