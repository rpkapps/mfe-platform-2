import { createFileRoute, Outlet } from "@tanstack/react-router"

// Layout route: its breadcrumb ("Assets") sits between the MFE root and the
// asset pages, exactly like a nested TanStack layout.
export const Route = createFileRoute("/assets")({
  staticData: { breadcrumb: "Assets" },
  component: () => <Outlet />,
})
