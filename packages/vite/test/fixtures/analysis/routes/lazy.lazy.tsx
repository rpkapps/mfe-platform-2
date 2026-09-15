import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/lazy")({
  component: () => null,
})
