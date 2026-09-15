import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/assets")({
  staticData: { breadcrumb: "Assets", permissionGroups: ["assets:read"] },
  beforeLoad: ({ context }) => {
    if (!context.platform.permissions.hasGroup("assets:read")) throw redirect({ to: "/" })
  },
  component: () => <p>Assets</p>,
})
