import { TEST_IDS } from "@platform-internal/conformance"

import { Badge } from "@tecton/react/components/badge"
import { Button } from "@tecton/react/components/button"
import {
  Card,
  CardAction,
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

export interface FdaStatusProps {
  code: string
  title: string
  status: string
  wells: number
}

/**
 * A field development alternative at a glance. Opens a dialog, and from it a
 * second one: proves overlay ordering across roots and nesting.
 */
export function FdaStatus({
  code = "FDA 1.02",
  title = "Satellite drill locations",
  status = "Ongoing",
  wells = 4,
}: Partial<FdaStatusProps>) {
  return (
    <Card data-testid={ids.fdaStatus}>
      <CardHeader>
        <CardDescription className="font-mono">{code}</CardDescription>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <Badge appearance="outline">{status}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">{wells} wells in this alternative.</p>
        <DialogTrigger>
          <Button size="sm" data-testid={ids.fdaStatusOpen}>
            Review alternative
          </Button>
          <Dialog data-testid={ids.fdaStatusDialog}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                Rendered by a hidden React 19 widget library.
              </DialogDescription>
            </DialogHeader>
            <DialogTrigger>
              <Button variant="outline" data-testid={ids.fdaStatusNested}>
                Compare with reference case
              </Button>
              <Dialog data-testid={ids.fdaStatusNestedDialog}>
                <DialogHeader>
                  <DialogTitle>Reference case</DialogTitle>
                  <DialogDescription>
                    Stacked above the first one by the shell overlay manager.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter showCloseButton />
              </Dialog>
            </DialogTrigger>
            <DialogFooter showCloseButton />
          </Dialog>
        </DialogTrigger>
      </CardContent>
    </Card>
  )
}
