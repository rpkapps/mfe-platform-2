import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ context }) => {
    if (!(context as { admin?: boolean }).admin) throw redirect({ to: "/" })
  },
  component: () => <div>Settings</div>,
  staticData: {
    breadcrumb: { label: "Settings", hidden: false },
    permissionGroups: ["sample:admin"],
  },
})
