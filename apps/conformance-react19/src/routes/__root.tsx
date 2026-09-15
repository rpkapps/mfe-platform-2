import * as React from "react"
import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { MfeErrorBoundary, useMfeInstance, usePlatform } from "@platform/react"
import { TEST_IDS } from "@platform-internal/conformance"

import { Badge } from "@tecton/react/components/badge"

import { useAssetTrackerSettings } from "@/lib/settings"

const ids = TEST_IDS.assetTracker

export const Route = createRootRoute({
  staticData: { breadcrumb: "Asset Tracker" },
  component: RootLayout,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive p-4 text-sm">
      Asset Tracker failed: {error.message}
    </div>
  ),
  notFoundComponent: () => <p className="p-4 text-sm text-muted-foreground">Nothing here (MFE not-found boundary).</p>,
})

function RootLayout() {
  const instance = useMfeInstance()
  useAssetTrackerSettings()
  const hmr = usePlatform((p) => p.runtime.environment)
  return (
    <MfeErrorBoundary>
      <div data-testid={ids.root} className="flex min-h-64 flex-col gap-4 p-4 text-foreground">
        <nav className="flex items-center gap-2 border-b border-border pb-2 text-sm">
          <Link to="/" className="font-medium underline-offset-4 hover:underline" activeProps={{ className: "font-medium text-primary" }}>
            Dashboard
          </Link>
          <Link to="/assets" data-testid={ids.navAssets} className="underline-offset-4 hover:underline" activeProps={{ className: "text-primary" }}>
            Assets
          </Link>
          <Link to="/settings" data-testid={ids.navSettings} className="underline-offset-4 hover:underline" activeProps={{ className: "text-primary" }}>
            Settings
          </Link>
          <span className="ml-auto flex items-center gap-2">
            <Badge variant="secondary" appearance="outline" data-testid={ids.reactVersion}>
              React {React.version}
            </Badge>
            <Badge variant="secondary" appearance="outline">
              {instance.mfeId} · {hmr}
            </Badge>
          </span>
        </nav>
        <Outlet />
      </div>
    </MfeErrorBoundary>
  )
}
