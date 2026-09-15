import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/assets/$assetId")({
  beforeLoad: ({ context }) => {
    if (!context.platform.permissions.hasGroup("assets:read")) throw redirect({ to: "/" })
  },
  loader: ({ params }) => params,
  component: () => null,
  staticData: {
    breadcrumb: { label: "Asset", dynamic: true },
    navigation: { title: "Asset", description: "One asset", icon: "box", keywords: ["asset"], order: 2, hidden: true },
    permissionGroups: ["assets:read", "assets:write"],
  },
} satisfies Record<string, unknown>)
