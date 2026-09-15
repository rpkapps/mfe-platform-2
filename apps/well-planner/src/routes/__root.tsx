import * as React from "react"
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router"
import {
  MfeErrorBoundary,
  useMfeInstance,
  useNavigation,
  usePlatform,
  useRegisterCommand,
  type MfeRouterContext,
} from "@platform/mfe-react"
import { TEST_IDS } from "@platform-internal/conformance"

import { Badge } from "@tecton/react/components/badge"

import { useWellPlannerSettings } from "@/lib/settings"

const ids = TEST_IDS.wellPlanner

export const Route = createRootRouteWithContext<MfeRouterContext>()({
  staticData: { breadcrumb: "Well Planner" },
  component: RootLayout,
  errorComponent: ({ error }: { error: unknown }) => (
    <div role="alert" className="border-destructive rounded-md border p-4 text-sm">
      Well Planner failed: {error instanceof Error ? error.message : String(error)}
    </div>
  ),
  notFoundComponent: () => (
    <p className="text-muted-foreground p-4 text-sm">Nothing here (MFE not-found boundary).</p>
  ),
})

function RootLayout() {
  const instance = useMfeInstance()
  useWellPlannerSettings()
  const navigation = useNavigation()
  // Root-level command: live whenever the MFE is mounted (also headless), so shortcut
  // conflicts with other remotes are detected deterministically.
  useRegisterCommand({
    id: "go-to-dashboard",
    label: "Go to concept select",
    group: "Well Planner",
    shortcut: "mod+shift+d",
    handler: () => navigation.navigateWithin("/"),
  })
  const hmr = usePlatform((p) => p.runtime.environment)
  return (
    <MfeErrorBoundary>
      <div data-testid={ids.root} className="text-foreground flex min-h-64 flex-col gap-4 p-4">
        <nav className="border-border flex items-center gap-2 border-b pb-2 text-sm">
          <Link
            to="/"
            className="font-medium underline-offset-4 hover:underline"
            activeProps={{ className: "font-medium text-primary" }}
          >
            Concept select
          </Link>
          <Link
            to="/wells"
            data-testid={ids.navWells}
            className="underline-offset-4 hover:underline"
            activeProps={{ className: "text-primary" }}
          >
            Wells
          </Link>
          <Link
            to="/settings"
            data-testid={ids.navSettings}
            className="underline-offset-4 hover:underline"
            activeProps={{ className: "text-primary" }}
          >
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
