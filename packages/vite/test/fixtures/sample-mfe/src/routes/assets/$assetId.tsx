import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/assets/$assetId")({
  component: Asset,
  staticData: {
    breadcrumb: { label: ({ params }: { params: { assetId: string } }) => params.assetId },
  },
})

function Asset() {
  const { assetId } = Route.useParams()
  return <div>Asset {assetId}</div>
}
