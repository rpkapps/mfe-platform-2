import * as React from "react"
import { useMfeInstance, useRegisterCommand } from "@platform/mfe-react"
import { TEST_IDS } from "@platform-internal/conformance"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tecton/react/components/card"

export function KpiTile({
  label,
  value,
  unit,
}: {
  label: string
  value: number
  unit?: string
}) {
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
    <Card data-testid={TEST_IDS.widgets.kpiTile} data-instance={instance.instanceId}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-2xl">
          {value}
          {unit ? <span className="text-muted-foreground ml-1 text-sm">{unit}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">
        React {React.version} · refreshed {refreshed}×
      </CardContent>
    </Card>
  )
}
