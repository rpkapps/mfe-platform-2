import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/plain")({
  component: () => null,
  staticData: { breadcrumb: "Plain" },
})
