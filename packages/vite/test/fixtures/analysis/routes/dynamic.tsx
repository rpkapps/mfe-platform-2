import { createFileRoute } from "@tanstack/react-router"

const groups = ["computed"]

export const Route = createFileRoute("/reports")({
  component: () => null,
  staticData: {
    breadcrumb: ({ loaderData }: { loaderData: { title: string } }) => loaderData.title,
    navigation: { title: computeTitle() },
    permissionGroups: groups,
  },
})

function computeTitle() {
  return "Reports"
}
