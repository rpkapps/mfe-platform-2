import { createFileRoute, Outlet } from "@tanstack/react-router"

// Layout route: its breadcrumb ("Wells") sits between the MFE root and the
// well pages, exactly like a nested TanStack layout.
export const Route = createFileRoute("/wells")({
  staticData: { breadcrumb: "Wells" },
  component: () => <Outlet />,
})
