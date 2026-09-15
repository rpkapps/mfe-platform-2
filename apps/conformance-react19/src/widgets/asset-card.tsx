import { useNavigation, useRegisterCommand } from "@platform/react"
import { ASSETS, TEST_IDS } from "@platform-internal/conformance"

import { Button } from "@tecton/react/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tecton/react/components/card"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@tecton/react/components/dialog"

const ids = TEST_IDS.widgets

export function AssetCard({ assetId, compact }: { assetId: string; compact?: boolean }) {
  const asset = ASSETS.find((candidate) => candidate.id === assetId)
  const navigation = useNavigation()
  useRegisterCommand({
    id: "open-asset",
    label: `Open ${asset?.name ?? assetId}`,
    group: "Widgets",
    handler: () => navigation.navigate(`/asset-tracker/assets/${assetId}`),
  })
  return (
    <Card
      data-testid={ids.assetCard}
      data-asset={assetId}
      className={compact ? "py-2" : undefined}
    >
      <CardHeader>
        <CardTitle>{asset?.name ?? assetId}</CardTitle>
        <CardDescription>
          {asset ? `${asset.status} · ${asset.site}` : "Unknown asset"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <DialogTrigger>
          <Button size="sm" data-testid={ids.assetCardOpen}>
            Details
          </Button>
          <Dialog data-testid={ids.assetCardDialog}>
            <DialogHeader>
              <DialogTitle>{asset?.name ?? assetId}</DialogTitle>
              <DialogDescription>
                Opened from a widget rendered in its own React root.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter showCloseButton />
          </Dialog>
        </DialogTrigger>
        <Button
          size="sm"
          variant="outline"
          onPress={() => navigation.navigate(`/asset-tracker/assets/${assetId}`)}
        >
          Open
        </Button>
      </CardContent>
    </Card>
  )
}
