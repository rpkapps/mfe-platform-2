// {{^tecton}}
import * as React from "react"
// {{/tecton}}
import { useMfeInstance, useNavigation, useRegisterCommand } from "@platform/react"
// {{#tecton}}
import { Button } from "@tecton/react/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tecton/react/components/card"
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@tecton/react/components/dialog"
// {{/tecton}}

import { SAMPLE_ASSETS } from "@/lib/api"

export interface AssetCardProps {
  assetId: string
  compact?: boolean
}

/**
 * A widget: an ordinary component the shell mounts in its own React root (see
 * `createWidget` in src/mfe.tsx). Props are validated against `propsSchema`. Commands
 * registered here are instance-scoped and removed when the widget is disposed.
 */
export function AssetCard({ assetId, compact }: AssetCardProps) {
  const asset = SAMPLE_ASSETS.find((candidate) => candidate.id === assetId)
  const navigation = useNavigation()
  const { routePrefix } = useMfeInstance()
  const detailHref = `${routePrefix ?? ""}/assets/${assetId}`
  const title = asset?.name ?? assetId

  useRegisterCommand({
    id: "open-asset",
    label: `Open ${title}`,
    group: "Widgets",
    handler: () => navigation.navigate(detailHref),
  })

  // {{#tecton}}
  return (
    <Card data-asset={assetId} className={compact ? "py-2" : undefined}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{asset ? `${asset.status} · ${asset.site}` : "Unknown asset"}</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        {/* Ordinary Tecton overlay: it renders into the shell overlay root for this instance. */}
        <DialogTrigger>
          <Button size="sm">Details</Button>
          <Dialog>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>Opened from a widget rendered in its own React root.</DialogDescription>
            </DialogHeader>
            <DialogFooter showCloseButton />
          </Dialog>
        </DialogTrigger>
        <Button size="sm" variant="outline" onPress={() => navigation.navigate(detailHref)}>
          Open
        </Button>
      </CardContent>
    </Card>
  )
  // {{/tecton}}
  // {{^tecton}}
  const [open, setOpen] = React.useState(false)
  return (
    <section data-asset={assetId} className={compact ? "rounded-md border border-border p-2" : "rounded-md border border-border p-4"}>
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{asset ? `${asset.status} · ${asset.site}` : "Unknown asset"}</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="rounded border border-border px-2 py-1 text-sm" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide details" : "Details"}
        </button>
        <button type="button" className="rounded border border-border px-2 py-1 text-sm" onClick={() => navigation.navigate(detailHref)}>
          Open
        </button>
      </div>
      {open ? <p className="mt-2 text-sm">Details for {title}, rendered inside the widget's own React root.</p> : null}
    </section>
  )
  // {{/tecton}}
}
