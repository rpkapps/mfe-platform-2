import { createRootRoute, Outlet } from "@tanstack/react-router"

export const Route = createRootRoute({
  staticData: { breadcrumb: "Valid MFE" },
  component: () => <Outlet />,
})
