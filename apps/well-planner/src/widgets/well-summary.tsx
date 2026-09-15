import { useNavigation, useRegisterCommand } from "@platform/mfe-react"
import {
  TEST_IDS,
  WELL_STATUS_META,
  WELL_TYPE_META,
  type WellStatus,
  type WellType,
} from "@platform-internal/conformance"

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
import { Stat, StatGroup, StatLabel, StatValue } from "@tecton/react/tecton/stat"

const ids = TEST_IDS.widgets

export interface WellSummaryProps {
  wellId: string
  name: string
  field: string
  status: WellStatus
  type: WellType
  td: number
  compact?: boolean
}

/**
 * Props only: a widget renders what the surface gives it and never fetches on
 * the shell's behalf, so one slot cannot stall another.
 */
export function WellSummary({
  wellId,
  name,
  field,
  status,
  type,
  td,
  compact,
}: WellSummaryProps) {
  const navigation = useNavigation()
  const meta = WELL_STATUS_META[status]
  useRegisterCommand({
    id: "open-well",
    label: `Open ${name}`,
    group: "Widgets",
    handler: () => navigation.navigate(`/well-planner/wells/${wellId}`),
  })
  return (
    <Card
      data-testid={ids.wellSummary}
      data-well={wellId}
      className={compact ? "py-2" : undefined}
    >
      <CardHeader>
        <CardDescription>
          {field} · {WELL_TYPE_META[type]}
        </CardDescription>
        <CardTitle className="font-mono">{name}</CardTitle>
        <CardAction>
          <Badge variant={meta.tone} appearance="outline">
            {meta.label}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <StatGroup>
          <Stat size="sm">
            <StatLabel>Total depth</StatLabel>
            <StatValue unit="m MD">{td.toLocaleString("en-GB")}</StatValue>
          </Stat>
        </StatGroup>
        <div className="flex gap-2">
          <DialogTrigger>
            <Button size="sm" data-testid={ids.wellSummaryOpen}>
              Details
            </Button>
            <Dialog data-testid={ids.wellSummaryDialog}>
              <DialogHeader>
                <DialogTitle>{name}</DialogTitle>
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
            onPress={() => navigation.navigate(`/well-planner/wells/${wellId}`)}
          >
            Open
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
