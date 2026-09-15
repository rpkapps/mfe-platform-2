import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router"
import { MfeErrorBoundary, useMfeInstance, type MfeRouterContext } from "@platform/react"
// {{#tecton}}
import { Badge } from "@tecton/react/components/badge"
// {{/tecton}}

/**
 * Root route: layout, breadcrumb root label and the MFE-level error / not-found
 * boundaries. `context.platform` (user, permissions, runtime, telemetry…) is available
 * to every route's `beforeLoad` and `loader`.
 */
export const Route = createRootRouteWithContext<MfeRouterContext>()({
  staticData: { breadcrumb: "__DISPLAY_NAME__" },
  component: RootLayout,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive p-4 text-sm">
      __DISPLAY_NAME__ failed: {error.message}
    </div>
  ),
  notFoundComponent: () => <p className="p-4 text-sm text-muted-foreground">Nothing here.</p>,
})

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/assets", label: "Assets" },
  { to: "/settings", label: "Settings" },
] as const

function RootLayout() {
  const instance = useMfeInstance()
  return (
    <MfeErrorBoundary>
      <div className="flex min-h-64 flex-col gap-4 p-4 text-foreground">
        <nav aria-label="__DISPLAY_NAME__" className="flex items-center gap-3 border-b border-border pb-2 text-sm">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="underline-offset-4 hover:underline"
              activeProps={{ className: "font-medium text-primary" }}
              activeOptions={{ exact: link.to === "/" }}
            >
              {link.label}
            </Link>
          ))}
          <span className="ml-auto">
            {/* {{#tecton}} */}
            <Badge variant="secondary" appearance="outline">
              {instance.mfeId}
            </Badge>
            {/* {{/tecton}} */}
            {/* {{^tecton}} */}
            <span className="rounded border border-border px-2 py-0.5 text-xs">{instance.mfeId}</span>
            {/* {{/tecton}} */}
          </span>
        </nav>
        <Outlet />
      </div>
    </MfeErrorBoundary>
  )
}
