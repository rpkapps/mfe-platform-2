import { createFileRoute, Link } from "@tanstack/react-router"

import { Badge } from "@tecton/react/components/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@tecton/react/components/table"

import { listAssets } from "@/lib/data"

export const Route = createFileRoute("/assets/")({
  staticData: { navigation: { title: "Assets", description: "All equipment", keywords: ["pumps", "valves"], order: 1 } },
  loader: async () => listAssets(),
  component: AssetList,
})

const statusVariant = { online: "success", offline: "destructive", maintenance: "warning" } as const

function AssetList() {
  const assets = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-3">
      <Link to="/assets/$assetId" params={{ assetId: "restricted" }} className="text-xs underline">
        Restricted asset (admins only)
      </Link>
    <Table aria-label="Assets">
      <TableHeader>
        <TableHead isRowHeader>Asset</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Site</TableHead>
      </TableHeader>
      <TableBody>
        {assets.map((asset) => (
          <TableRow key={asset.id}>
            <TableCell>
              <Link to="/assets/$assetId" params={{ assetId: asset.id }} className="underline-offset-4 hover:underline">
                {asset.name}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant[asset.status]} appearance="outline">
                <span className="asset-status-dot bg-current" /> {asset.status}
              </Badge>
            </TableCell>
            <TableCell>{asset.site}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  )
}
