import * as React from "react"
import { useMfeInstance, useRegisterCommand } from "@platform/mfe-react"
import { TEST_IDS } from "@platform-internal/conformance"

import { Card, CardContent, CardDescription, CardHeader } from "@tecton/react/components/card"
import { Stat, StatDelta, StatHelp, StatLabel, StatValue } from "@tecton/react/tecton/stat"

export interface ProductionKpiProps {
  label: string
  value: number
  unit?: string
  /** Change against the previous period, in percent. */
  delta?: number
  help?: string
}

/** A production readout with its period-on-period change. */
export function ProductionKpi({ label, value, unit, delta, help }: ProductionKpiProps) {
  const [refreshed, setRefreshed] = React.useState(0)
  const instance = useMfeInstance()
  // Instance-scoped: two tiles register two distinct commands.
  useRegisterCommand({
    id: "refresh-tile",
    label: `Refresh ${label}`,
    group: "Widgets",
    handler: () => setRefreshed((n) => n + 1),
  })
  return (
    <Card data-testid={TEST_IDS.widgets.productionKpi} data-instance={instance.instanceId}>
      <CardHeader>
        <CardDescription>Production</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Stat>
          <StatLabel>{label}</StatLabel>
          <StatValue unit={unit}>{value.toLocaleString("en-GB")}</StatValue>
          {delta === undefined ? null : (
            <StatDelta trend={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}>
              {delta > 0 ? "+" : ""}
              {delta}%
            </StatDelta>
          )}
          {help ? <StatHelp>{help}</StatHelp> : null}
        </Stat>
        <p className="text-muted-foreground text-xs">
          React {React.version} · refreshed {refreshed}×
        </p>
      </CardContent>
    </Card>
  )
}
