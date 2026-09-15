import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router"
import { MfeErrorBoundary, useMfeInstance, type MfeRouterContext } from "@platform/mfe-react"
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
  errorComponent: ({ error }: { error: unknown }) => (
    <div role="alert" className="border-destructive rounded-md border p-4 text-sm">
      __DISPLAY_NAME__ failed: {error instanceof Error ? error.message : String(error)}
    </div>
  ),
  notFoundComponent: () => <p className="text-muted-foreground p-4 text-sm">Nothing here.</p>,
})

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/wells", label: "Wells" },
  { to: "/settings", label: "Settings" },
] as const

function RootLayout() {
  const instance = useMfeInstance()
  return (
    <MfeErrorBoundary>
      <div className="text-foreground flex min-h-64 flex-col gap-4 p-4">
        <nav
          aria-label="__DISPLAY_NAME__"
          className="border-border flex items-center gap-3 border-b pb-2 text-sm"
        >
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
            <span className="border-border rounded border px-2 py-0.5 text-xs">
              {instance.mfeId}
            </span>
            {/* {{/tecton}} */}
          </span>
        </nav>
        <Outlet />
      </div>
    </MfeErrorBoundary>
  )
}
